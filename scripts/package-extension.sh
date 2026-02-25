#!/bin/bash
set -e

cd extension

pnpm build

cd dist
zip -r ../package.zip .
