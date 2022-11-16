# egg-etcd-grpc

<!--
Description here.
-->

## Install

```bash
$ npm i egg-etcd-grpc --save
```

## Usage

```js
// {app_root}/config/plugin.js
exports.etcdGrpc = {
  enable: true,
  package: 'egg-etcd-grpc',
};
```

## Configuration

```js
// {app_root}/config/config.default.js
exports.etcdGrpc = {
    demoRpc: {
        etcd: {
            hosts: [
                '127.0.0.1:2379',
            ],
            key: "demo.rpc",
            auth: {
                username: '',
                password: '',
            }
        },
        grpc: {
            loaderOption: {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            },
            protoPath: 'app/grpc/demo',
            deadline: 1000,
        }
    },
};
```

see [config/config.default.js](config/config.default.js) for more detail.

## Example

```
// {app_root}/config/config.default.js
exports.grpcClient = {
    demoRpc: {
        etcd: {
            hosts: [
                '127.0.0.1:2379',
            ],
            key: "demo.rpc",
            auth: {
                username: 'root',
                password: 'root',
            }
        },
        grpc: {
            loaderOption: {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            },
            protoPath: 'app/grpc/demo',
            deadline: 1000,
        }
    },
};

// {app_base}/app/grpc/demo/demo.proto
syntax = "proto3";

package passport.profile;

service ProfileService {
    rpc getUserInfo (UserID) returns (UserInfo) {
    }
}

service ProfileService2 {
    rpc getUserInfo (UserID) returns (UserInfo) {
    }
}

message UserID {
    string userId = 1;
}

message UserInfo {
    string userId = 1;
    string username = 2;
    string avatar = 3;
    string nickname = 4;
    string gender = 5;
}

// use
app.grpcClient.demoRpc.passport.profile.ProfileService.getUserInfo({userId: '230371e2-eb07-4b2b-aa61-73fd27c5387e'}).
    then((res) => {
        console.log(res)
    }).catch((e) => {
        console.log(e)
    })
```

<!-- example here -->

## Questions & Suggestions

Please open an issue [here](https://github.com/lihuanwz/egg-etcd-grpc/issues).

## License

[MIT](LICENSE)
