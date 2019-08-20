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

       // setting up gridFS with mongoDB
      var mongoose = require('mongoose');
      var Grid = require('gridfs-stream');


      const DBURI = 'mongodb://127.0.0.1:27017/faxUploads';

      mongoose.connect(DBURI, {useMongoClient: true, useNewUrlParser: true});

      var connection = mongoose.connection;

      if (connection != undefined) {
        console.log(connection.readyState.toString());

        var objs = JSON.parse(result.body);
        for (let i = 0; i < objs.length; i++) {
          var faxFileName = objs[i].DocumentParams.Hash;
          if (objs[i].DocumentParams.Type === 'image/tiff') {
              faxFileName += '.tiff';
          } else if (objs[i].DocumentParams.Type === 'application/pdf') {
              faxFileName += '.pdf';
          } else {
            throw new Error('unhandled mimetype');
          }

          // parsing binary data from base64 FaxImage response
          var base64Data = objs[i].FaxImage;
          var binaryData = new Buffer(base64Data, 'base64').toString('binary');
          // declare path to faxFile  in local storage
          var pathFaxFile = path.join(saveDir, faxFileName);
          // saving fax image to user's directory for storing through mongoDb
          fs.writeFileSync(pathFaxFile, binaryData, 'binary');
          console.log(faxFileName + ' saved to ' + saveDir + '!');

          // remove faxImage element from the object
          delete objs[i].FaxImage;

          // saving file to mongoDB
          Grid.mongo = mongoose.mongo;
          connection.once('open', () => {
            console.log('connection opened for uploading');
            var gridfs = Grid(connection.db);
            if (gridfs) {
              var streamwriter = gridfs.createWriteStream({
                filename: faxFileName,
                mode: 'w',
                content_type: objs[i].DocumentParams.Type,
                metadata: objs[i],
              });
              fs.createReadStream(pathFaxFile).pipe(streamwriter);
              streamwriter.on('close', function(file) {
                console.log('file uploaded to mongoDB successfully');
                fs.remove(pathFaxFile);
              });
            } else {
              console.error('No GridFS object found!');
              res.status(500).send('Internal Server Error!');
            }
          });
        }
        console.log('All fax files successfully added to MongoDB');
        res.status(201).send('Fax file(s) successfully added to database');
      } else {
        console.error('Unable to connect to Database!');
        res.status(503).send('Failed to connect to server database, please try later!');
      }
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
