#!/bin/bash
set -e
docker build -t nodejs-tiktok-video-maker .
docker run -v "$(pwd)"/assets/:/app/assets/ -v "$(pwd)"/config.json:/app/config.json -it nodejs-tiktok-video-maker