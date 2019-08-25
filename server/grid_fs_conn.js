'use strict';

const os = require('os');
const fs = require('fs-extra');
const path = require('path');

// imports for mongoose and grid
var mongoose = require('mongoose');
var Grid = require('gridfs-stream');

module.exports = class GridFSConnector {
  constructor(DB_URI) {
    // check if directory for downloading fax exists
    // create otherwise
    this._DBURI = DB_URI;
    this._saveDir = path.join(os.homedir() + '/fax_downs');
    if (!fs.existsSync(this._saveDir)) {
      fs.mkdirsSync(this._saveDir, function(err) {
        if (err) console.error(err);
        else console.log('Dir Created');
      });
    }
  };

  _connectToMongo() {
    // connect to database
    mongoose.connect(this._DBURI, {useMongoClient: true});
    mongoose.connection.on('error', (err) => {
      console.log('Connection error: ' + err);
      res.status(500).send('Internal Server Error!');
    });
    mongoose.connection.on('open', () => {console.log('connection established to database'); });
  };

  uploadFax(err, result) {
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
      var pathFaxFile = path.join(this._saveDir, faxFileName);
      filePaths.push(pathFaxFile);

      // saving fax image to user's directory for storing through mongoDb
      fs.writeFileSync(pathFaxFile, binaryData, 'binary');
      console.log(faxFileName + ' saved to ' + this._saveDir + '!');

      // remove faxImage element from the object
      delete objs[i].FaxImage;
    }
    this._connectToMongo();
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
        throw new Error('No GridFS object found');
      }
      await setTimeout(() => {
        console.log('All fax files successfully added to MongoDB');
        mongoose.connection.close();
        console.log('database connection closed');
      }, 3000 * filePaths.length);
    });
  };
}
