'use strict';

const protoLoader = require('@grpc/proto-loader');
const grpcCore = require('@grpc/grpc-js');
const path = require('node:path');
const fs = require('node:fs');
const {Etcd3} = require('etcd3');

const definition = {
  // key: {
  //     etcdObject,
  //     etcdConfig,
  //     grpcConfig,
  //     grpcClients,
  //     RpcCons: null,
  //     grpcCore: null,
  // }
};

module.exports = async app => {
  const config = app.config.etcdGrpc;
  for (const rpcName in config) {
    let etcdConfig = config[rpcName].etcd;
    let grpcConfig = config[rpcName].grpc;
    let etcdObject = new Etcd3(etcdConfig);
    let grpcClients = {};

    const keyValue = await etcdObject.getAll()
      .prefix(etcdConfig.key + '/');
    let i = 0;
    for (const k in keyValue) {
      grpcClients[k] = {
        serverAddress: keyValue[k],
        RpcCons: null,
      };
      i++;
    }
    if (i === 0) {
      throw new Error('RPC[' + rpcName + '] server not found');
    }

    definition[rpcName] = {
      etcdObject,
      etcdConfig,
      grpcConfig,
      grpcClients,
      RpcCons: null,
      grpcCore: null,
    };
    app.grpcClient = {};
    app.grpcClient[rpcName] = await createClient(app, rpcName);

    watcher(rpcName);
  }
};

function watcher(rpcName) {
  const etcdObject = definition[rpcName].etcdObject;
  const etcdConfig = definition[rpcName].etcdConfig;
  const grpcClients = definition[rpcName].grpcClients;
  if (definition[rpcName] === undefined) {
    throw new Error('RPC[' + rpcName + '] server not found');
  }

  function del(kv) {
    // console.log("delete", kv.key.toString(), kv.value.toString());
    delete grpcClients[kv.key.toString()];
  }

  function put(kv) {
    // console.log('put', kv.key.toString(), kv.value.toString());
    grpcClients[kv.key.toString()] = {
      serverAddress: kv.value.toString(),
      RpcCons: new definition[rpcName].RpcCons(
        kv.value.toString(),
        definition[rpcName].grpcCore.credentials.createInsecure()
      ),
    };
  }

  etcdObject.watch()
    .prefix(etcdConfig.key + '/')
    .create()
    .then(watcher => {
      watcher.on('put', put)
        .on('delete', del);
    });
}

function rand(min, max) {
  return parseInt(Math.random() * (max - min + 1) + min, 10);
}

async function createClient(app, rpcName) {
  const service = {};
  await getAllServices(app, rpcName, service);
  return service;
}

async function getAllServices(app, rpcName, service) {
  if (definition[rpcName] === undefined) {
    throw new Error('RPC[' + rpcName + '] server not found');
  }
  const grpcConfig = definition[rpcName].grpcConfig;
  const grpcClients = definition[rpcName].grpcClients;
  const protoPath = path.join(app.baseDir, grpcConfig.protoPath);
  if (!fs.existsSync(protoPath)) {
    throw new Error('no proto file');
  }
  const protoPaths = fs.readdirSync(protoPath);
  for (const protoName of protoPaths) {
    const photoFilePath = path.join(protoPath, protoName);
    const stats = fs.statSync(photoFilePath);
    if (stats.isFile() && path.extname(protoName) === '.proto') {
      const protoObj = await protoLoader.load(photoFilePath, grpcConfig.loaderOption || {});
      const Rpc = grpcCore.loadPackageDefinition(protoObj);
      for (const packageName in protoObj) {
        const RpcCons = getServerClassByPackageName(Rpc, packageName);
        if (typeof RpcCons != 'function') {
          continue;
        }
        const handler = getControllerClassByPackageName(service, packageName);

        definition[rpcName].RpcCons = RpcCons;
        definition[rpcName].grpcCore = grpcCore;
        for (const keyCli in grpcClients) {
          grpcClients[keyCli].RpcCons = new RpcCons(
            grpcClients[keyCli].serverAddress,
            grpcCore.credentials.createInsecure()
          );
        }

        buildService(rpcName, handler, protoObj[packageName]);
      }
    }
  }
}

function getControllerClassByPackageName(controllers, packageName) {
  const ps = packageName.split('.');
  if (!ps || ps.length === 0) {
    return null;
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

function getServerClassByPackageName(controllers, packageName) {
  const ps = packageName.split('.');
  if (!ps || ps.length === 0) {
    return null;
  }
  let controller = controllers;
  for (const p of ps) {
    controller = controller[p];
    if (!controller) {
      return null;
    }
  }
  return controller;
}


function buildService(rpcName, service, proto) {
  for (const method in proto) {
    service[method] = runService.bind(null, rpcName, method);
  }
}

function runService(rpcName, method, params) {
  if (!definition[rpcName]) {
    throw new Error('RPC[' + rpcName + '] server not found');
  }

  return new Promise((resolve, reject) => {
    const deadline = definition[rpcName].grpcConfig.deadline || 3000;
    const grpcClients = definition[rpcName].grpcClients;
    const keys = Object.keys(definition[rpcName].grpcClients);
    if (keys.length === 0) {
      reject(new Error('RPC[' + rpcName + '] server not found'));
      return;
    }
    let index = rand(0, keys.length - 1);
    const grpcClient = grpcClients[keys[index]];
    if (grpcClient.RpcCons === null) {
      reject(new Error('RPC[' + rpcName + '] server not found'));
      return;
    }

    grpcClient.RpcCons.waitForReady(Date.now() + deadline, (error) => {
      if (error) {
        reject(error);
      } else {
        grpcClient.RpcCons[method](params, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      }
    });
  });
}
