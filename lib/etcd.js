'use strict';

const protoLoader = require('@grpc/proto-loader');
const grpc = require('@grpc/grpc-js');
const path = require('node:path');
const fs = require('node:fs');
const {Etcd3} = require('etcd3');
const GrpcCallException = require('../exception/gpscall')

class etcd {
  constructor(etcdConfig, grpcConfig, baseDir) {
    this.etcdConfig = etcdConfig;
    this.etcdObject = new Etcd3(this.etcdConfig);
    this.grpcConfig = grpcConfig;
    this.grpcClient = {};
    this.ClassGrpc = {};
    this.grpcCall = {};
    this.baseDir = baseDir;

    this.watcher();
  }

  async getGrpcClient() {
    this.grpcClient = this.loadProtoClass();

    let i = await this.getKeyValues();
    if (i === 0) {
      throw new GrpcCallException('RPC[' + this.etcdConfig.key + '] server not found');
    }
    return this.grpcClient;
  }

  async getKeyValues() {
    const keyValue = await this.etcdObject.getAll()
      .prefix(this.etcdConfig.key + '/');
    let i = 0;
    for (const key in keyValue) {
      // console.log("getKeyValues", key, keyValue[key]);
      for (const packageName in this.ClassGrpc) {
        this.grpcCall[packageName] === undefined && (this.grpcCall[packageName] = {});
        this.grpcCall[packageName][key] = new this.ClassGrpc[packageName].NewClass(
          keyValue[key],
          grpc.credentials.createInsecure()
        );
      }
      i++;
    }
    return i;
  }

  watcher() {
    this.etcdObject.watch()
      .prefix(this.etcdConfig.key + '/')
      .create()
      .then(watcher => {
        watcher.on('put', this.putEtcdServer.bind(this))
          .on('delete', this.deleteEtcdServer.bind(this))
          .on('connecting', this.connecting.bind(this))
          .on('connected', this.connectSuccess.bind(this))
          .on('disconnected', this.connectBreak.bind(this))
          .on('error', this.connectError.bind(this));
      });
  }

  clearGrpcCall() {
    this.grpcCall = {};
  }

  deleteEtcdServer(kv) {
    // console.log("delete", kv.key.toString(), kv.value.toString());
    for (const packageName in this.ClassGrpc) {
      if (this.grpcCall
        && this.grpcCall[packageName]
        && this.grpcCall[packageName][kv.key.toString()]
      ) {
        delete this.grpcCall[packageName][kv.key.toString()]
      }
    }
  }

  putEtcdServer(kv) {
    // console.log('put', kv.key.toString(), kv.value.toString());
    for (const packageName in this.ClassGrpc) {
      this.grpcCall[packageName] === undefined && (this.grpcCall[packageName] = {});
      this.grpcCall[packageName][kv.key.toString()] = new this.ClassGrpc[packageName].NewClass(
        kv.value.toString(),
        grpc.credentials.createInsecure()
      );
    }
  }

  connecting() {
    console.info('connecting');
  }

  connectSuccess() {
    console.info('connectSuccess');
  }

  connectBreak() {
    console.info('connectBreak');
  }

  connectError() {
    // console.error('error');
    this.clearGrpcCall();
    this.etcdObject.close();

    this.etcdObject = new Etcd3(this.etcdConfig);
    this.watcher();
    this.getKeyValues().then(i => {
      if (i > 0) {
        //
      }
    });
  }

  protoFiles() {
    const protoPath = path.join(this.baseDir, this.grpcConfig.protoPath);
    if (!fs.existsSync(protoPath)) {
      throw new GrpcCallException(`directory[${protoPath}] does not exist`);
    }

    const fileStat = fs.statSync(protoPath);
    if (!fileStat.isDirectory()) {
      throw new GrpcCallException(`not a directory[${protoDir}]`);
    }

    const protoPaths = fs.readdirSync(protoPath);

    return protoPaths
      .filter(name => name.endsWith('.proto'))
      .map(fileName => path.join(protoPath, fileName));
  }

  loadProtoClass() {
    let service = {};

    for (const protoFile of this.protoFiles()) {
      const loadProto = protoLoader.loadSync(
        protoFile,
        this.grpcConfig.loaderOption || {}
      );
      const ClassGrpc = grpc.loadPackageDefinition(loadProto);

      for (const packageName in loadProto) {
        const Class = eval('ClassGrpc.' + packageName);
        if (typeof Class != 'function') {
          continue;
        }
        ClassGrpc.NewClass = Class;
        this.ClassGrpc[packageName] = ClassGrpc;

        const handler = this.getServiceByPackageName(service, packageName);
        for (const method in loadProto[packageName]) {
          handler[method] = this.runService.bind(this, packageName, method);
        }
      }
    }
    return service;
  }

  getServiceByPackageName(controllers, packageName) {
    const ps = packageName.split('.');
    if (!ps || ps.length === 0) {
      return controllers;
    }
    let controller = controllers;
    for (const p of ps) {
      if (!controller[p]) {
        controller[p] = {};
      }
      controller = controller[p];
    }
    return controller;
  }

  runService(packageName, method, params) {
    const deadline = this.grpcConfig.deadline || 3000;
    const keys = Object.keys(this.grpcCall[packageName]);
    if (keys.length === 0) {
      throw new GrpcCallException('RPC[' + this.etcdConfig.key + '] server not found');
    }
    let index = this.rand(0, keys.length - 1);
    const client = this.grpcCall[packageName][keys[index]];
    if (client === undefined || client === null) {
      throw new GrpcCallException('RPC[' + this.etcdConfig.key + '] server not found');
    }

    return new Promise((resolve, reject) => {
      client.waitForReady(Date.now() + deadline, (error) => {
        if (error) {
          reject(new GrpcCallException(error));
        } else {
          client[method](params, (err, res) => {
            if (err) {
              reject(new GrpcCallException(err));
            } else {
              resolve(res);
            }
          });
        }
      });
    });
  }

  rand(min, max) {
    return parseInt(Math.random() * (max - min + 1) + min, 10);
  }
}

module.exports = etcd;
