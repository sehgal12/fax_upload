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
    // setting Grid storage to mongoose connection
    Grid.mongo = mongoose.mongo;
  };

  uploadFax(result) {
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
    mongoose.connection.once('open', async function() {
      console.log('connection opened for uploading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        for (let i = 0; i < filePaths.length; i++) {
          var streamwriter = gridfs.createWriteStream({
            filename: path.basename(filePaths[i]),
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


  searchFax(query, res){
    this._connectToMongo();
    mongoose.connection.once('open', async function() {
      console.log('connection opened for downloading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        gridfs.files.find(query).toArray(function(err, files) {
          if(!files || files.length === 0) {
            return res.status(404).send('No matching files found for query: '+query);
          }
          res.set('Content-Type', 'application/json');
          return res.status(200).send(files);
        })
      } else {
        console.error('No GridFS object found');
        return res.status(500).send('Internal Server Error!');
      }
      await setTimeout(() => {
        console.log('fax files sent for query: '+query);
        mongoose.connection.close();
        console.log('database connection closed');
      }, 3000);
    });
  }


  downloadFax(faxFileName, res){
    this._connectToMongo();
    mongoose.connection.once('open', async function() {
      console.log('connection opened for downloading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        gridfs.files.find({filename: faxFileName}).toArray(function(err, files) {
          if(!files || files.length === 0) {
            return res.status(404).send('No matching files found!');
          }
          var readstream = gridfs.createReadStream({
            filename: files[0].filename
          });
          res.writeHead(200, {
            "Content-Disposition": "attachment;filename=" + files[0].filename,
            'Content-Type': files[0].contentType,
            'Content-Length': files[0].metadata.DocumentParams.Length
          });
          return readstream.pipe(res);
        })
      } else {
        console.error('No GridFS object found');
        return res.status(500).send('Internal Server Error!');
      }
      await setTimeout(() => {
        console.log('fax file with name '+faxFileName+' sent successfully');
        mongoose.connection.close();
        console.log('database connection closed');
      }, 3000);
    });
  }


  getFaxMetadata(faxFileName, res){
    this._connectToMongo();
    mongoose.connection.once('open', async function() {
      console.log('connection opened for downloading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        gridfs.files.find({filename: faxFileName}).toArray(function(err, files) {
          if(!files || files.length === 0) {
            return res.status(404).send('No matching files found!');
          }
          res.set('Content-Type', 'application/json');
          return res.status(200).send(files[0].metadata);
        })
      } else {
        console.error('No GridFS object found');
        return res.status(500).send('Internal Server Error!');
      }
      await setTimeout(() => {
        console.log('metadata for fax file with name '+faxFileName+' sent successfully');
        mongoose.connection.close();
        console.log('database connection closed');
      }, 3000);
    });
  }
}
