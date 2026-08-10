#!/usr/bin/env node

import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64url");

console.log("Generated outlet orders API bearer key:");
console.log(key);
console.log("");
console.log("Add to afterten-website-portal/.env (server-side only):");
console.log(`OUTLET_ORDERS_API_BEARER_KEY=${key}`);
