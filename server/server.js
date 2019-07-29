// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: loopback-workspace
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var request = require('request');
const fs = require('fs-extra');
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


app.use('/process_fax', function (req, res, next) {

  request.get('http://50.200.140.121:33935/fax', function (err, result) {
    if (err) throw err;
    var obj = JSON.parse(result.body);
    // for( i in obj){


    // }
    var imageBuffer = decodeBase64Image(obj[1].FaxImage);
    fs.writeFile('test.tiff', imageBuffer.data, function (err) { if (err) throw err;
      console.log("entering form data");
      var formData = {
    
        
        custom_file: {
          value: fs.createReadStream(__dirname + '/..' + '/test.tiff'),
          options: {
            // filename: 'test,tiff',
            contentType: 'image/jpg'
          }
        }
      };
      
      request.post({ url: url, formData: formData }, function (err, httpResponse, body) {
        if (err) {
          return console.error('upload failed:', err);
        }
        console.log('Upload successful!  Server responded with:', body);
      });
    
      res.send("Fax file is successfully uploaded");
    })
})


  

        

});


// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
