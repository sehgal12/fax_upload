// The module eases the connection overhead we face with
// using GridFS with big files in MongoDB
'use strict';

// system level imports required for basic functionality
const os = require('os');
const path = require('path');

// advanced file system operations module
const fs = require('fs-extra');

// imports for mongoose and grid
var mongoose = require('mongoose');
var Grid = require('gridfs-stream');

module.exports = class GridFSConnector {
  // initiate the GridFSConnector by passing the URL to the database
  constructor(DB_URI) {

    this._DBURI = DB_URI;
    // fax files are temporarily saved here till upload
    this._saveDir = path.join(os.homedir() + '/fax_downs');
    // check if directory for temporary storage of fax exists or not
    // create otherwise
    if (!fs.existsSync(this._saveDir)) {
      fs.mkdirsSync(this._saveDir, function(err) {
        if (err) console.error(err);
        else console.log('Dir Created');
      });
    }
  };

  // method to establish connection to mongoDB
  _connectToMongo() {
    // connect to database
    mongoose.connect(this._DBURI, {useMongoClient: true});
    // throw Error in case of connection failure
    mongoose.connection.on('error', (err) => {
      console.error('Connection error: ' + err);
      throw new Error('Failed to connect to MongoDB');
    });
    mongoose.connection.on('open', () => {console.log('connection established to database'); });
    // set Grid storage to mongoose connection
    Grid.mongo = mongoose.mongo;
  };

  // method to upload fax file with metadata
  // takes input as the response of GET on http://50.200.140.121:33935/fax
  uploadFax(result) {
    // parse JS object from string
    var objs = JSON.parse(result.body);
    var filePaths = [];
    for (let i = 0; i < objs.length; i++) {
      // set hash of the file as the name for saving
      var faxFileName = objs[i].DocumentParams.Hash;
      // determine document type and save accordingly
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
    try{
      this._connectToMongo();
    } catch(e) {
      console.error(e);
      throw new Error('Failed to establish database connection!')
    }
    mongoose.connection.once('open', async function() {
      console.log('connection opened for uploading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        // iterate each file and save to mongoDB
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
      // wait 3 seconds for each file to save as per the tests conducted
      await setTimeout(() => {
        console.log('All fax files successfully added to MongoDB');
        mongoose.connection.close();
        console.log('database connection closed');
      }, 3000 * filePaths.length);
    });
  };

  // method to search fax
  // takes in query parameter as {"field1" : "value", "field2": "value"}
  // takes in response to be returned as the second parameter
  searchFax(query, res){
    try{
      this._connectToMongo();
    } catch(e) {
      console.error(e);
      return res.status(500).send('Internal Server Error');
    }
    mongoose.connection.once('open', async function() {
      console.log('connection opened for downloading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        // use gridFS inbuild find capability
        gridfs.files.find(query).toArray(function(err, files) {
          if(!files || files.length === 0) {
            return res.status(404).send('No matching files found for query: '+query);
          }
          // send all data as a JSON list to the user
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

  // download fax file
  // pass in the name of the file
  // pass in the response object
  downloadFax(faxFileName, res){
    try{
      this._connectToMongo();
    } catch(e) {
      console.error(e);
      return res.status(500).send('Internal Server Error');
    }
    mongoose.connection.once('open', async function() {
      console.log('connection opened for downloading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        gridfs.files.find({filename: faxFileName}).toArray(function(err, files) {
          if(!files || files.length === 0) {
            return res.status(404).send('No matching files found!');
          }
          // send to user the first file matching the query
          // file names are created from hash and hence are unique
          var readstream = gridfs.createReadStream({
            filename: files[0].filename
          });
          // set response headers for appropriate delivery
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

  // get metadata for a fax file
  // pass in name of the fax file
  // pass in response object
  getFaxMetadata(faxFileName, res){
    try{
      this._connectToMongo();
    } catch(e) {
      console.error(e);
      return res.status(500).send('Internal Server Error');
    }
    mongoose.connection.once('open', async function() {
      console.log('connection opened for downloading');
      var gridfs = Grid(mongoose.connection.db);
      if (gridfs) {
        gridfs.files.find({filename: faxFileName}).toArray(function(err, files) {
          if(!files || files.length === 0) {
            return res.status(404).send('No matching files found!');
          }
          // pass in metadata as JSON response
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
