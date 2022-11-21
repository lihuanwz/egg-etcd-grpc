/**
 * GRPC调用异常处理类
 */
class GrpcCallException extends Error {
  constructor(err) {
    if (typeof err === 'string') {
      super(err);
      this.message = err;
    } else {
      super(err.message);
      this.message = err.message;
      this.code = err.code;
      this.details = err.details;
      this.metadata = err.metadata;
    }
  }
}

module.exports = GrpcCallException;
