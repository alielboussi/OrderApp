"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppStorageBucket = getAppStorageBucket;
const storage_1 = require("firebase-admin/storage");
const DEFAULT_BUCKET = "afterten-portal-system.firebasestorage.app";
function getAppStorageBucket() {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
        process.env.STORAGE_BUCKET?.trim() ||
        DEFAULT_BUCKET;
    return (0, storage_1.getStorage)().bucket(bucketName);
}
//# sourceMappingURL=storage-bucket.js.map