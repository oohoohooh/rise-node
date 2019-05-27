#!/usr/bin/env bash

cd /home/rise
cp -R rise_node/node_modules .
cp rise_node/package.json .
npm rebuild
mv node_modules/* dist
# asterisk doesnt expand to hidden dirs
mv node_modules/.bin dist/.bin
