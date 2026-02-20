import { register } from 'module';

// For CommonJS require
require.extensions['.md'] = function (module: any, filename: string) {
  module.exports = '';
};
// For ESM (Node 20+), this is a no-op, but present for completeness
export default {};
