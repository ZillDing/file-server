const logger = require('log4js').getLogger();
const rimraf = require('rimraf');
const _ = require('lodash');
const express = require('express');
const app = express();
const server = require('http').Server(app);
const PORT = 3000;

const formidable = require('formidable');
const fs = require('fs');
const Grid = require('gridfs-stream');
const mongoose = require('mongoose');
Grid.mongo = mongoose.mongo;

const MONGO_DB_CONN_ADDR = 'mongodb://localhost/file-server';
const conn = mongoose.createConnection(MONGO_DB_CONN_ADDR);
conn.once('open', () => {
  logger.info(`Successfully connect to: ${MONGO_DB_CONN_ADDR}`);
  const gfs = Grid(conn.db);

  // serve a static web page for testing purpose
  app.use(express.static('public'));

  const saveFile = (file) => {
    const writeStream = gfs.createWriteStream({
      filename: file.name,
      content_type: file.type
    });
    fs.createReadStream(file.path).pipe(writeStream);
  };

  app.post('/upload', (req, res) => {
    const form = new formidable.IncomingForm();
    form.uploadDir = 'uploads';
    form.keepExtensions = true;
    form.multiples = true;
    form.parse(req, (err, fields, files) => {
      if (!files.files) return res.status(400).end();

      if (_.isArray(files.files)) {
        files.files.forEach(saveFile);
      } else {
        saveFile(files.files);
      }
      res.status(204).end();
    });
  });

  server.listen(PORT, () => {
    logger.info(`Server started on port: ${PORT}`);
  });

});
