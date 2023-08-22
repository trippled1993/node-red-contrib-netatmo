/**
 * Copyright 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
const mustache = require('mustache');
const fetch = require('node-fetch');
const httpTransport = require('https');

const callRefreshToken = ({ clientId, clientSecret, refreshToken }) => {
    return new Promise((resolve, reject) => {
  
      const responseEncoding = 'utf8';
      const httpOptions = {
        hostname: 'api.netatmo.com',
        port: '443',
        path: '/oauth2/token',
        method: 'POST',
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      };
      httpOptions.headers['User-Agent'] = 'node ' + process.version;
  
      const request = httpTransport.request(httpOptions, (res) => {
        let responseBufs = [];
        let responseStr = '';
  
        res.on('data', (chunk) => {
          if (Buffer.isBuffer(chunk)) {
            responseBufs.push(chunk);
          }
          else {
            responseStr = responseStr + chunk;
          }
        }).on('end', () => {
          responseStr = responseBufs.length > 0 ? Buffer.concat(responseBufs).toString(responseEncoding) : responseStr;
          if (res.statusCode === 200) {
            let json;
            try {
              json = JSON.parse(responseStr);
              resolve(json.access_token);
            } catch (e) {
              reject(e);
            }
          } else {
            reject('Unable to refresh the access token. Status: '+ res.statusCode + ', URI: '+ uri);
          }
        });
      })
        .setTimeout(0)
        .on('error', (error) => {
          callback(error);
        });
      let uri = `grant_type=refresh_token&refresh_token=${encodeURI(refreshToken)}&client_id=${clientId}&client_secret=${clientSecret}`
      request.write(uri);
      request.end();
    });
  };

module.exports = function(RED)
{
    "use strict";

    function NetatmoGetPublicData(config) {
        RED.nodes.createNode(this,config);
        this.creds = RED.nodes.getNode(config.creds);
        var node = this;
        this.on('input', async function(msg, send, done) {
            // send/done compatibility for node-red < 1.0
            send = send || function () { node.send.apply(node, arguments) };
            done = done || function (error) { node.error.call(node, error, msg) };

            const clientSecret = this.creds.credentials.client_secret;
            const clientId = this.creds.credentials.client_id;
            const refreshToken = this.creds.credentials.refresh_token;

            config.lat_ne = config.lat_ne || '15';
            config.lon_ne = config.lon_ne || '20';
            config.lat_sw = config.lat_sw || '-15';
            config.lon_sw = config.lon_sw || '-20';
            config.required_data = config.required_data || 'rain,humidity';
            config.filter = config.filter || false;
            this.lat_ne = mustache.render(config.lat_ne, msg);
            this.lon_ne = mustache.render(config.lon_ne, msg);
            this.lat_sw = mustache.render(config.lat_sw, msg);
            this.lon_sw = mustache.render(config.lon_sw, msg);
            this.required_data = mustache.render(config.required_data, msg);
            this.filter = mustache.render(config.filter, msg);

            // const netatmo = require('netatmo');

            // const auth = {
            //     "client_id": this.creds.credentials.client_id,
            //     "client_secret": this.creds.credentials.client_secret,
            //     "username": this.creds.credentials.username, 
            //     "password": this.creds.credentials.password
            // };
            // const api = new netatmo(auth);
            
            // api.on("error", function(error) {
            //     node.error(error);
            // });

            // api.on("warning", function(error) {
            //     node.warn(error);
            // });                 
            
            var options = {
                lat_ne: config.lat_ne,
                lon_ne: config.lon_ne,
                lat_sw: config.lat_sw,
                lon_sw: config.lon_sw,
                required_data: config.required_data,
                filter: config.filter,
            };

            // api.getPublicData(options,function(err, data) {
            //     msg.payload = data;
            //     node.send(msg);
            // });

            let data;
            try {
                // for some reason the same request with node-fetch is not working
                const refreshedToken = await callRefreshToken({ clientSecret, clientId, refreshToken });;

                // Get Station data (GET https://api.netatmo.com/api/getstationsdata?get_favorites=false)
                const response = await fetch("https://api.netatmo.com/api/getpublicdata?" + new URLSearchParams(options), {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${refreshedToken}`
                    }
                });
                data = await response.json();
                msg.payload = data;
                node.send(msg);
            } catch (e) {
                done(e);
                return;
            }

        });
    }
    RED.nodes.registerType("get public data",NetatmoGetPublicData);
}