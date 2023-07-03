import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import {
  OriginAccessIdentity,
  CloudFrontWebDistribution,
  ViewerCertificate,
  SecurityPolicyProtocol,
  SSLMethod,
} from 'aws-cdk-lib/aws-cloudfront';

import { Construct } from 'constructs';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { config } from '../../app.config';
import { Environment } from '../../config/types';

interface WebappStackProps extends StackProps {
  domain: string;
  name: string;
  environment: Environment;
  webappCertificate: Certificate;
}

export class WebappStack extends Stack {
  public distribution: CloudFrontWebDistribution;
  public bucket: Bucket;
  public domain: string;

  constructor(scope: Construct, id: string, props: WebappStackProps) {
    super(scope, id, props);

    const { deploymentConfig } = config.environments[props.environment];
    if (!deploymentConfig) {
      throw new Error(
        'Can not deploy an environment without a deployment config. Please add one to your environment in app.config.ts'
      );
    }

    const { subdomain } = deploymentConfig;

    this.domain = subdomain ? `app.${subdomain}.${props.domain}` : `app.${props.domain}`;

    // Creates a new bucket that we will upload our React app to
    this.bucket = new Bucket(this, 'WebappHostingBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      blockPublicAccess: new BlockPublicAccess({ restrictPublicBuckets: false }),
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Creates an origin access identity so we can control access to the bucket
    const oai = new OriginAccessIdentity(this, 'WebappCloudFrontOriginAccessIdentity');
    this.bucket.grantRead(oai.grantPrincipal);

    // Creates a new CloudFront distribution that we will use to access our webapp
    this.distribution = new CloudFrontWebDistribution(this, 'WebappDistribution', {
      viewerCertificate: ViewerCertificate.fromAcmCertificate(props.webappCertificate, {
        aliases: [this.domain, `www.${this.domain}`],
        securityPolicy: SecurityPolicyProtocol.TLS_V1_2_2021,
        sslMethod: SSLMethod.SNI,
      }),
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: this.bucket,
            originAccessIdentity: oai,
          },
          behaviors: [{ isDefaultBehavior: true }],
        },
      ],
      errorConfigurations: [
        {
          errorCode: 404,
          errorCachingMinTtl: 300,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    const hostedZone = HostedZone.fromLookup(this, 'Zone', { domainName: props.domain });

    // Create a new A record for our domain that will route requests from app.<your-domain> to the react app
    new ARecord(this, 'WebappARecord', {
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
      zone: hostedZone,
      recordName: this.domain,
    });

    // Creates some stack outputs that we can read when deploying to know where to upload the webapp
    new CfnOutput(this, 'WebappHostingBucketName', { value: this.bucket.bucketName });
    new CfnOutput(this, 'CloudFrontID', { value: this.distribution.distributionId });

    new StringParameter(this, 'AppDomainParameter', {
      parameterName: `/${props.name}/${props.environment}/APP_DOMAIN`,
      stringValue: `https://${this.domain}`,
    });
  }
}
