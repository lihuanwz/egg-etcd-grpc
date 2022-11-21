/**
 * GRPC调用异常处理类
 */
class GrpcCallException extends Error {
  constructor(err) {
    super(err.message);
    this.message = err.message;
    this.code = err.code;
    this.details = err.details;
    this.metadata = err.metadata;
  }
}
module.exports = GrpcCallException;
