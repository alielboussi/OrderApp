"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPANION_PRODUCT_IDS_BY_SOURCE = void 0;
exports.getCompanionProductIdsForAllowlistedSources = getCompanionProductIdsForAllowlistedSources;
/** Keep in sync with order-qty-rules.ts in afterten-website-portal. */
exports.COMPANION_PRODUCT_IDS_BY_SOURCE = {
    "4313479e-0f97-4197-a638-bee916bf4a07": [
        "738dad70-1667-47a9-965d-29cf9b8376bf",
        "581151dc-420d-4158-b8dd-604a4a612703",
    ],
    "84a62432-988c-4727-b4e0-40e5862e2a34": [
        "bdc3821e-1ea9-46ec-91f2-9ec4cb307b80",
        "36b40d08-d316-4896-ac0b-1d975b58bb0b",
        "5769bfc0-e22d-4577-a2bf-6b1ed34c655b",
        "efbf1a8d-ecbf-40ed-8fd0-c2b7a6f315b0",
        "2599ce11-3c51-498d-8aeb-9c1a09d27f61",
    ],
    "25ec621e-aab0-47b3-9ec2-7c2fd8e28996": [
        "4c4e3685-e836-4490-98b0-84beaadb35b3",
        "207cc3cc-09d6-4abe-ae2d-031a2f13c595",
        "337bbf4a-5df8-42be-a936-b1dd2a5e8541",
    ],
};
function getCompanionProductIdsForAllowlistedSources(sourceProductIds) {
    const ids = new Set();
    for (const sourceProductId of sourceProductIds) {
        for (const companionId of exports.COMPANION_PRODUCT_IDS_BY_SOURCE[sourceProductId] ?? []) {
            ids.add(companionId);
        }
    }
    return [...ids];
}
//# sourceMappingURL=order-companion-products.js.map