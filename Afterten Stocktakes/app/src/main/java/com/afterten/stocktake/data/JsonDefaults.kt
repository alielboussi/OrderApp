package com.afterten.stocktake.data

import kotlinx.serialization.json.Json

// Shared Json instance configured to tolerate unknown fields
val relaxedJson: Json = Json { ignoreUnknownKeys = true }

// Variant that also encodes default values when serializing
val relaxedJsonWithDefaults: Json = Json(relaxedJson) { encodeDefaults = true }
