const logger = require('log4js').getLogger();
const express = require('express');
const app = express();
const server = require('http').Server(app);
const _ = require('lodash');

const formidable = require('formidable');
const fs = require('fs');
const Grid = require('gridfs-stream');
const mongoose = require('mongoose');
Grid.mongo = mongoose.mongo;

const PORT = 3000;
const UPLOAD_PATH = 'uploads';
const MONGO_DB_CONN_ADDR = 'mongodb://localhost/file-server';

function deleteUploadDir () {
  const rimraf = require('rimraf');
  return new Promise((resolve, reject) => {
    rimraf(UPLOAD_PATH, error => {
      if (error) {
        logger.error(error);
        reject(`Error deleting upload dir: ${UPLOAD_PATH}`);
      } else {
        logger.trace(`Successfully deleted upload dir: ${UPLOAD_PATH}`);
        resolve();
      }
    });
  });
}

function createUploadDir () {
  return new Promise((resolve, reject) => {
    fs.mkdir(UPLOAD_PATH, error => {
      if (error) {
        logger.error(error);
        reject(`Error creating upload dir: ${UPLOAD_PATH}`);
      } else {
        logger.trace(`Successfully created upload dir: ${UPLOAD_PATH}`);
        resolve();
      }
    });
  });
}

function connectMongoDb () {
  return new Promise((resolve, reject) => {
    const conn = mongoose.createConnection(MONGO_DB_CONN_ADDR);
    conn.once('open', () => {
      logger.trace(`Successfully connected to: ${MONGO_DB_CONN_ADDR}`);
      resolve(conn);
    });
    conn.on('error', () => {
      reject(`Unable to connect to: ${MONGO_DB_CONN_ADDR}`);
    });
  });
}

function setupApp (conn) {
  return new Promise((resolve, reject) => {
    const gfs = Grid(conn.db);

    // serve a static web page for testing purpose
    app.use(express.static('public'));

    const saveFile = (file) => {
      logger.trace(`Saving file: ${file.name}, type: ${file.type}`);
      const writeStream = gfs.createWriteStream({
        filename: file.name,
        content_type: file.type
      });
      fs.createReadStream(file.path).pipe(writeStream);
    };

    app.post('/upload', (req, res) => {
      logger.trace(`Received upload request`);
      const form = new formidable.IncomingForm();
      form.uploadDir = 'uploads';
      form.keepExtensions = true;
      form.multiples = true;
      form.parse(req, (err, fields, files) => {
        if (!files.files) {
          logger.warn('Bad request, need to provide files field');
          return res.status(400).end();
        }

        if (_.isArray(files.files)) {
          files.files.forEach(saveFile);
        } else {
          saveFile(files.files);
        }
        res.status(204).end();
      });
    });

    resolve();
  });
}

function startServer () {
  return new Promise((resolve, reject) => {
    server.on('error', error => {
      logger.error(error);
      reject(`Server cannot start on port: ${PORT}`);
    });
    server.listen(PORT, () => {
      logger.info(`Server started on port: ${PORT}`);
    });
  });
}

// Chain actions
deleteUploadDir()
.then(createUploadDir)
.then(connectMongoDb)
.then(setupApp)
.then(startServer)
.catch(error => {
  logger.fatal(error);
  process.exit(1);
});
