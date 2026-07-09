# AWS SDK

Apply the bucket region to the S3 client explicitly when a service has a dedicated `s3-region` flag:

```go
// GOOD
s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
    o.Region = s3Region
    o.UsePathStyle = userCfg.S3UsePathStyle
})

// BAD — s3Region computed but never applied; client silently uses the wrong region
s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
    o.UsePathStyle = userCfg.S3UsePathStyle
})
```
