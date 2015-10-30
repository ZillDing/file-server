import React, { Component, PropTypes } from 'react';
import request from 'superagent';
import io from 'socket.io-client';
import _ from 'lodash';
import NotificationSystem from 'react-notification-system';
import Dropzone from 'react-dropzone';
import md5 from 'md5';
import { Buffer } from 'buffer';

import { SERVER_ADDR } from './config';
import styles from './styles';

class DropArea extends Component {
  handleOnDrop(files) {
    // files.forEach(file => {
    //   const reader = new FileReader();
    //   reader.onload = e => {
    //     const ab = e.target.result;
    //     const buffer = new Buffer(new Uint8Array(ab));
    //     console.log(md5(buffer));
    //   }
    //   reader.readAsArrayBuffer(file);
    // });
    this.props.uploadFiles(files);
  }

  _getLoader() {
    if (this.props.uploading) {
      return (
        <div className="ui active dimmer">
          <div className="ui text loader">Uploading...</div>
        </div>
      );
    }
  }

  render() {
    const containerStyle = {
      position: 'relative'
    };
    const textStyle = {
      marginTop: 0,
      position: 'absolute',
      textAlign: 'center',
      top: 35,
      width: '100%',
      zIndex: -9999
    };

    return (
      <div style={containerStyle}>
        <Dropzone ref="dropzone"
          onDrop={this.handleOnDrop.bind(this)}
          style={styles.dropzoneStyle}
          activeStyle={styles.dropzoneActiveStyle}>
        </Dropzone>
        <h3 style={textStyle}>Dropping files here (or click to select) to upload...</h3>
        {this._getLoader()}
      </div>
    );
  }
}
DropArea.propTypes = {
  uploadFiles: PropTypes.func.isRequired,
  uploading: PropTypes.bool
};

class FilesTable extends Component {
  _handleDeleteClick(id, e) {
    e.currentTarget.setAttribute('disabled', 'disabled');
    e.currentTarget.className += ' disabled loading';
    this.props.deleteFile(id);
  }

  render() {
    return (
      <table className="ui compact table">
        <thead>
          <tr>
            <th>Index</th>
            <th>File Name</th>
            <th>File Type</th>
            <th>Size</th>
            <th>Upload Time</th>
            <th>MD5</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {
            this.props.files.slice().reverse().map((file, index) => {
              return (
                <tr key={file._id}>
                  <td>{index}</td>
                  <td>{file.filename}</td>
                  <td>{file.contentType}</td>
                  <td>{Math.ceil(file.length / 1000)} kb</td>
                  <td>{file.uploadDate}</td>
                  <td>{file.md5}</td>
                  <td>
                    <a className="primary ui small icon button"
                      target="_blank"
                      href={`${SERVER_ADDR}/download/${file._id}`}>
                      <i className="download icon"></i>
                    </a>
                    <button className="negative ui small icon button"
                      onClick={this._handleDeleteClick.bind(this, file._id)}>
                      <i className="trash icon"></i>
                    </button>
                  </td>
                </tr>
              );
            })
          }
        </tbody>
      </table>
    );
  }
}
FilesTable.propTypes = {
  deleteFile: PropTypes.func.isRequired,
  files: PropTypes.array
};

class UploadProgress extends Component {
  render() {
    if (this.props.percent < 0) return <div/>;

    const barStyle ={
      width: `${this.props.percent}%`
    }
    const title = this.props.percent === 100 ? 'Done!' : 'Uploading...';
    const titleStyle = { marginBottom: 5 };

    return (
      <div className="ui message" style={styles.uploadProgressStyle}>
        <i className="close icon" onClick={this.props.dismiss}></i>
        <div className="header" style={titleStyle}>{title}</div>
        <div className="ui indicating progress" data-percent={this.props.percent}>
          <div className="bar" style={barStyle}></div>
          <div className="label">Progress</div>
        </div>
      </div>
    );
  }
}
UploadProgress.propTypes = {
  dismiss: PropTypes.func.isRequired,
  percent: PropTypes.number
};

export class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      files: [],
      uploadPercent: -1,
      uploading: false
    };
  }

  componentDidMount() {
    const socket = io(SERVER_ADDR);
    socket.on('connect', () => {
      this._addNotification({
        message: 'Connected to server',
        level: 'success'
      });
      this._loadData();
    });
    socket.on('disconnect', () => {
      this._addNotification({
        message: 'Lost connection with server',
        level: 'error'
      });
    });
    socket.on('add file', file => {
      this._addNotification({
        message: `New file added: ${file.filename}`,
        level: 'success'
      });
      const files = this.state.files.concat(file);
      this.setState({files});
    });
    socket.on('delete file', _id => {
      this._addNotification({
        message: `File deleted: ${_id}`,
        level: 'error'
      });
      const file = _.findWhere(this.state.files, {_id});
      const files = _.without(this.state.files, file);
      this.setState({files});
    });
  }

  _addNotification(o) {
    this.refs.notificationSystem.addNotification(o);
  }

  _deleteFile(id) {
    request
      .del(`${SERVER_ADDR}/files/${id}`)
      .end((err, res) => {
        if (err) {
          this._addNotification({
            message: err.error,
            level: 'error'
          });
        }
      });
  }

  _dismissUploadProgress() {
    this.setState({
      uploadPercent: -1
    });
  }

  _loadData() {
    // make ajax request
    request
      .get(`${SERVER_ADDR}/files`)
      .end((err, res) => {
        if (err) {
          this._addNotification({
            message: err.error,
            level: 'error'
          });
        } else {
          this.setState({
            files: res.body
          });
        }
      });
  }

  _uploadFiles(files) {
    this.setState({
      uploading: true,
      uploadPercent: 0
    });
    const req = request.post(`${SERVER_ADDR}/upload`);
    files.forEach(file => {
      req.attach(_.uniqueId('file_'), file, file.name);
    });
    req
      .on('progress', e => {
        this.setState({
          uploadPercent: Math.ceil(e.percent)
        });
      })
      .end((err, res) => {
        this.setState({
          uploading: false
        });
        if (err) {
          this._addNotification({
            message: err.error,
            level: 'error'
          });
        }
      });
  }

  render() {
    return (
      <div className="ui container">
        <h1>File Server</h1>
        <DropArea uploadFiles={this._uploadFiles.bind(this)}
          uploading={this.state.uploading} />
        <UploadProgress percent={this.state.uploadPercent}
          dismiss={this._dismissUploadProgress.bind(this)} />
        <FilesTable files={this.state.files}
          deleteFile={this._deleteFile.bind(this)} />
        <NotificationSystem ref="notificationSystem" />
      </div>
    );
  }
}
