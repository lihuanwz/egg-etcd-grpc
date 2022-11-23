'use strict';

const GrpcEtcd = require('./lib/etcd')

module.exports = async app => {
  const config = app.config.etcdGrpc;
  let grpcClient = {};
  for (const rpcName in config) {
    let etcdConfig = config[rpcName].etcd;
    let grpcConfig = config[rpcName].grpc;
    let grpcEtcd = new GrpcEtcd(etcdConfig, grpcConfig, app.baseDir);
    grpcClient[rpcName] = await grpcEtcd.getGrpcClient();
  }
  app.grpcClient = grpcClient;
};
