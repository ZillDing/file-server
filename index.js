const logger = require('log4js').getLogger();
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
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

function setupSocket () {
  return new Promise((resolve, reject) => {
    io.on('connection', socket => {
      logger.trace(`A new user connected: ${socket.id}`);
      socket.on('disconnect', () => {
        logger.trace(`User disconnected: ${socket.id}`);
      });
    });
    resolve();
  });
}

function setupApp (conn) {
  return new Promise((resolve, reject) => {
    const gfs = Grid(conn.db);

    // serve a static web page for testing purpose
    app.use(express.static('public'));

    // enable CORS
    const cors = require('cors');
    app.use(cors());
    app.options('*', cors());

    // GET /files
    app.get('/files', (req, res) => {
      gfs.files.find({}).toArray((error, files) => {
        if (error) {
          logger.error(error);
          res.status(500).end();
        } else {
          res.json(files);
        }
      });
    });

    // GET /files/:id
    app.get('/files/:id', (req, res) => {
      const _id = req.params.id;
      gfs.findOne({_id}, (error, file) => {
        if (error) {
          logger.error(error);
          res.status(500).end();
        } else {
          res.json(file);
        }
      });
    });

    // DELETE /files/:id
    app.delete('/files/:id', (req, res) => {
      const _id = req.params.id;
      gfs.exist({_id}, (error, found) => {
        if (error) {
          res.status(500).end();
        } else {
          if (!found) {
            res.status(404).json({
              error: `No file with id: ${_id}`
            });
          } else {
            gfs.remove({_id}, error => {
              if (error) {
                logger.error(error);
                res.status(500).end();
              } else {
                logger.info(`Successfully deleted file with id: ${_id}`);
                io.emit('delete file', _id);
                res.status(204).end();
              }
            });
          }
        }
      });
    });

    // GET /download/:id
    app.get('/download/:id', (req, res) => {
      const _id = req.params.id;
      const readStream = gfs.createReadStream({_id});
      readStream.on('error', () => {
        logger.error(`Error downloading file`);
      });
      readStream.pipe(res);
    });

    const saveFile = (file) => {
      return new Promise((resolve, reject) => {
        const writeStream = gfs.createWriteStream({
          filename: file.name,
          content_type: file.type
        });
        writeStream.on('error', reject);
        writeStream.on('close', resolve);
        fs.createReadStream(file.path).pipe(writeStream);
      });
    };

    // POST /upload
    app.post('/upload', (req, res) => {
      logger.trace(`Received upload request`);
      const form = new formidable.IncomingForm();
      form.uploadDir = UPLOAD_PATH;
      form.keepExtensions = true;
      form.multiples = true;

      form.on('file', (name, file) => {
        logger.trace(`Start saving file: ${file.name}, type: ${file.type}`);
        saveFile(file)
        .then(file => {
          logger.info(`Successfully saved file: ${file.name} with id: ${file._id}`);
          io.emit('add file', file);
        })
        .catch(() => {
          logger.error(`Error saving file: ${file}`);
        });
      });
      form.on('error', error => {
        logger.error(error);
        res.status(500).end();
      });
      form.on('end', () => {
        res.status(204).end();
      });

      form.parse(req);
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
.then(setupSocket)
.then(connectMongoDb)
.then(setupApp)
.then(startServer)
.catch(error => {
  logger.fatal(error);
  process.exit(1);
});
