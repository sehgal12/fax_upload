// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: loopback-workspace
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var request = require('request');
const os = require('os');
const fs = require('fs-extra');
const path = require('path')
var promise =require('promise');
var url = 'http://localhost:3000/api/faxes/container/upload'

var app = module.exports = loopback();

app.start = function () {
  // start the web server
  return app.listen(function () {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }

  });


};

function decodeBase64Image(dataString) {
  var response = {};
  response.data = new Buffer.from(dataString, 'base64');

  return response;
}

app.use('/process_fax', function(req, res, next) {
    const saveDir = path.join(os.homedir() + '/fax_downs');
    if (!fs.existsSync(saveDir)){
      fs.mkdirsSync(saveDir, function(err) {
        if (err) console.error(err);
        else console.log('Dir Created');
      });
    }
    request.get('http://50.200.140.121:33935/fax', function(err, result) {
      if (err) throw err;
      var objs = JSON.parse(result.body);
      for (let i = 0; i < objs.length; i++) {
        var fileName = objs[i].DocumentParams.Hash;
        var faxFileName;
        if (objs[i].DocumentParams.Type === 'image/tiff') {
            faxFileName = fileName + '.tiff';
        } else if (objs[i].DocumentParams.Type === 'application/pdf') {
            faxFileName = fileName + '.pdf';
        }

        // parsing binary data from base64 FaxImage response
        var base64Data = objs[i].FaxImage;
        var binaryData = new Buffer(base64Data, 'base64').toString('binary');
        // saving fax image to user's directory for storing through mongoDb
        fs.writeFile(path.join(saveDir, faxFileName), binaryData, 'binary', function(err) {
          if (err) console.error(err);
          else console.log(faxFileName + ' saved to ' + saveDir + '!');
        });

        // parsing metadata, all except FaxImage
        delete objs[i].FaxImage;
        var jsonMetadata = JSON.stringify(objs[i]);
        var metadataFileName = fileName + '.json';
        fs.writeFile(path.join(saveDir, metadataFileName), jsonMetadata, 'utf-8', function(err) {
          if (err) console.error(err);
          else console.log(metadataFileName + ' saved to ' + saveDir + '!');
        });
      }

      //   request.post({ url: url, formData: formData }, function (err, httpResponse, body) {
      //     if (err) {
      //       return console.error('upload failed:', err);
      //     }
      //     console.log('Upload successful!  Server responded with:', body);
      //   });

      //   res.send("Fax file is successfully uploaded");
      // })
    });
});


// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
