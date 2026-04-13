import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

export class NewsDigestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const configuredNewsApiSecretArn = this.node.tryGetContext("newsApiSecretArn") ?? process.env.NEWS_API_SECRET_ARN;
    const configuredClaudeApiSecretArn = this.node.tryGetContext("claudeApiSecretArn") ?? process.env.CLAUDE_API_SECRET_ARN;

    if (!configuredNewsApiSecretArn || !configuredClaudeApiSecretArn) {
      throw new Error("Provide NEWS_API_SECRET_ARN and CLAUDE_API_SECRET_ARN through CDK context or environment variables.");
    }

    const newsApiSecret = importSecretByArn(this, "NewsApiSecret", configuredNewsApiSecretArn);
    const claudeApiSecret = importSecretByArn(this, "ClaudeApiSecret", configuredClaudeApiSecretArn);

    const dailyNewsDigestsTable = new dynamodb.Table(this, "DailyNewsDigestsTable", {
      tableName: "daily-news-digests",
      partitionKey: {
        name: "date",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "topic",
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const sharedLambdaEnvironment = {
      DIGESTS_TABLE_NAME: dailyNewsDigestsTable.tableName,
      NEWS_API_SECRET_ARN: newsApiSecret.secretArn,
      CLAUDE_API_SECRET_ARN: claudeApiSecret.secretArn
    };

    const fetchAndSummarizeFunction = new lambdaNodejs.NodejsFunction(this, "FetchAndSummarizeFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/lambdas/src/handlers/fetchAndSummarize.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(120),
      environment: sharedLambdaEnvironment,
      bundling: {
        externalModules: ["@aws-sdk/*"]
      }
    });

    const generateDigestFunction = new lambdaNodejs.NodejsFunction(this, "GenerateDigestFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/lambdas/src/handlers/generateDigest.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(120),
      environment: sharedLambdaEnvironment,
      bundling: {
        externalModules: ["@aws-sdk/*"]
      }
    });

    const schedulerDeadLetterQueue = new sqs.Queue(this, "SchedulerDeadLetterQueue", {
      retentionPeriod: cdk.Duration.days(14)
    });

    const getDigestFunction = new lambdaNodejs.NodejsFunction(this, "GetDigestFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/lambdas/src/handlers/getDigest.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      environment: {
        DIGESTS_TABLE_NAME: dailyNewsDigestsTable.tableName
      },
      bundling: {
        externalModules: ["@aws-sdk/*"]
      }
    });

    const api = new apigateway.RestApi(this, "NewsDigestApi", {
      restApiName: "news-digest-api",
      deployOptions: {
        stageName: "prod"
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"]
      }
    });

    const digestResource = api.root.addResource("digest");
    digestResource.addMethod("GET", new apigateway.LambdaIntegration(getDigestFunction));
    digestResource.addMethod("POST", new apigateway.LambdaIntegration(generateDigestFunction));

    dailyNewsDigestsTable.grantReadWriteData(fetchAndSummarizeFunction);
    dailyNewsDigestsTable.grantReadWriteData(generateDigestFunction);
    dailyNewsDigestsTable.grantReadData(getDigestFunction);
    newsApiSecret.grantRead(fetchAndSummarizeFunction);
    newsApiSecret.grantRead(generateDigestFunction);
    claudeApiSecret.grantRead(fetchAndSummarizeFunction);
    claudeApiSecret.grantRead(generateDigestFunction);

    const schedulerRole = new iam.Role(this, "FetchAndSummarizeScheduleRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com")
    });

    fetchAndSummarizeFunction.grantInvoke(schedulerRole);

    new scheduler.CfnSchedule(this, "DailyFetchAndSummarizeSchedule", {
      flexibleTimeWindow: {
        mode: "OFF"
      },
      scheduleExpression: "cron(0 7 * * ? *)",
      scheduleExpressionTimezone: "Europe/Berlin",
      target: {
        arn: fetchAndSummarizeFunction.functionArn,
        roleArn: schedulerRole.roleArn,
        deadLetterConfig: {
          arn: schedulerDeadLetterQueue.queueArn
        },
        retryPolicy: {
          maximumEventAgeInSeconds: 3600,
          maximumRetryAttempts: 2
        }
      }
    });

    schedulerDeadLetterQueue.grantSendMessages(schedulerRole);

    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    const frontendDistribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(1)
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(1)
        }
      ]
    });

    new cloudwatch.Alarm(this, "FetchAndSummarizeErrorsAlarm", {
      metric: fetchAndSummarizeFunction.metricErrors({
        period: cdk.Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alerts when the scheduled digest Lambda records errors."
    });

    new cloudwatch.Alarm(this, "GenerateDigestErrorsAlarm", {
      metric: generateDigestFunction.metricErrors({
        period: cdk.Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alerts when on-demand digest generation starts failing."
    });

    new cloudwatch.Alarm(this, "ApiGateway5xxAlarm", {
      metric: api.metricServerError({
        period: cdk.Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alerts when the digest API starts returning 5xx responses."
    });

    new cdk.CfnOutput(this, "ApiBaseUrl", {
      value: api.url,
      description: "Base URL for the news digest API"
    });

    new cdk.CfnOutput(this, "FrontendUrl", {
      value: `https://${frontendDistribution.distributionDomainName}`,
      description: "CloudFront URL for the hosted frontend"
    });

    new cdk.CfnOutput(this, "FrontendBucketName", {
      value: frontendBucket.bucketName,
      description: "S3 bucket name for frontend assets"
    });

    new cdk.CfnOutput(this, "FrontendDistributionId", {
      value: frontendDistribution.distributionId,
      description: "CloudFront distribution id for frontend invalidations"
    });
  }
}

function importSecretByArn(scope: Construct, id: string, secretArn: string): secretsmanager.ISecret {
  return /-[A-Za-z0-9]{6}$/.test(secretArn)
    ? secretsmanager.Secret.fromSecretCompleteArn(scope, id, secretArn)
    : secretsmanager.Secret.fromSecretPartialArn(scope, id, secretArn);
}
