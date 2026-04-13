#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NewsDigestStack } from "../lib/news-digest-stack";

const app = new cdk.App();

new NewsDigestStack(app, "NewsDigestStack");

