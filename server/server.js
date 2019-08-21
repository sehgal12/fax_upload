// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: loopback-workspace
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var request = require('request');
var mongoose = require('mongoose');
var Grid = require('gridfs-stream');
const os = require('os');
const fs = require('fs-extra');
const path = require('path');
var promise =require('promise');
var url = 'http://localhost:3000/api/faxes/container/upload'

var app = module.exports = loopback();

const DBURI = 'mongodb://127.0.0.1:27017/faxUploads';

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

app.use('/process_fax', async function(req, res, next) {
  const saveDir = path.join(os.homedir() + '/fax_downs');
  if (!fs.existsSync(saveDir)){
    fs.mkdirsSync(saveDir, function(err) {
      if (err) console.error(err);
      else console.log('Dir Created');
    });
  }
  request.get('http://50.200.140.121:33935/fax', async function(err, result) {
    if (err) throw err;
    var objs = JSON.parse(result.body);
    var filePaths = [];
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
      var binaryData = new Buffer.from(base64Data, 'base64').toString('binary');

      // declare path to faxFile  in local storage
      var pathFaxFile = path.join(saveDir, faxFileName);
      filePaths.push(pathFaxFile);

      // saving fax image to user's directory for storing through mongoDb
      fs.writeFileSync(pathFaxFile, binaryData, 'binary');
      console.log(faxFileName + ' saved to ' + saveDir + '!');

      // remove faxImage element from the object
      delete objs[i].FaxImage;
    }
    mongoose.connect(DBURI, {useMongoClient: true});
    mongoose.connection.on('error', (err) => {
      console.log('Connection error: ' + err);
      res.status(500).send('Internal Server Error!');
    });
    mongoose.connection.on('open', () => {console.log('connection established to database'); });
    // setting Grid storage to mongoose connection
    Grid.mongo = mongoose.mongo;
    mongoose.connection.once('open', async function() {
      console.log('connection opened for uploading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        for (let i = 0; i < filePaths.length; i++) {
          var streamwriter = gridfs.createWriteStream({
            filename: filePaths[i],
            mode: 'w',
            content_type: objs[i].DocumentParams.Type,
            metadata: objs[i],
          });
          fs.createReadStream(filePaths[i]).pipe(streamwriter);
          streamwriter.on('close', function(file) {
            console.log(filePaths[i] + ' uploaded to mongoDB successfully');
            fs.removeSync(filePaths[i]);
            console.log('local file ' + filePaths[i] + ' removed!')
          });
        }
      } else {
        console.error('No GridFS object found!');
        res.status(500).send('Internal Server Error!');
      }
      await setTimeout(() => {
        console.log('All fax files successfully added to MongoDB');
        res.status(201).send('Fax file(s) successfully added to database')
        mongoose.connection.close();
        console.log('database connection closed');
      }, 3000 * filePaths.length);
    });
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
