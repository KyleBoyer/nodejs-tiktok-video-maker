FROM linuxserver/ffmpeg:latest

RUN apt update && apt upgrade -y && apt install -y ca-certificates curl gnupg

RUN curl -SLO https://deb.nodesource.com/nsolid_setup_deb.sh && chmod 500 nsolid_setup_deb.sh && ./nsolid_setup_deb.sh 18 && rm -f ./nsolid_setup_deb.sh

RUN apt-get update && apt-get install nodejs -y

WORKDIR /app

COPY . ./

RUN npm install

ENTRYPOINT [ "node", "index.js" ]