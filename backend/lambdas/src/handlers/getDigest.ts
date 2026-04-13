import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { buildDigestErrorResponse, buildDigestSuccessResponse, resolveDigestDate, type StoredDigestItem } from "../lib/getDigest";
import { requireRuntimeEnv } from "../lib/runtime";

const DIGESTS_TABLE_NAME_ENV = "DIGESTS_TABLE_NAME";

const dynamoClient = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const tableName = requireRuntimeEnv(DIGESTS_TABLE_NAME_ENV);
    const date = resolveDigestDate(event.queryStringParameters?.date);

    const result = await documentClient.send(
      new QueryCommand({
        TableName: tableName,
        ConsistentRead: true,
        KeyConditionExpression: "#date = :date",
        ExpressionAttributeNames: {
          "#date": "date"
        },
        ExpressionAttributeValues: {
          ":date": date
        }
      })
    );

    const items = (result.Items as StoredDigestItem[] | undefined) ?? [];
    return buildDigestSuccessResponse(items, date);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return buildDigestErrorResponse("Failed to load the requested digest.", message, error);
  }
};
