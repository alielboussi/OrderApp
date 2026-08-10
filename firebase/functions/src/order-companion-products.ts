/** Keep in sync with order-qty-rules.ts in afterten-website-portal. */
export const COMPANION_PRODUCT_IDS_BY_SOURCE: Record<string, readonly string[]> = {
  "405807f9-03c9-401d-acb8-26980b492491": ["2e9ba460-476f-4f64-9750-cae9d4ce71fe"],
  "d550d20b-78f8-434f-a079-b7613cc00512": ["2e9ba460-476f-4f64-9750-cae9d4ce71fe"],
  "ca6c3236-05e9-42ad-a771-1c03a25dd5f1": ["2e9ba460-476f-4f64-9750-cae9d4ce71fe"],
  "cd145afb-0994-4c67-bf42-a9db9c3cc3ef": ["2e9ba460-476f-4f64-9750-cae9d4ce71fe"],
  "4b340326-5f47-492f-924b-4771e434ea60": ["3b3c6f8a-7766-491c-88c9-41d324d05174"],
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

export function getCompanionProductIdsForAllowlistedSources(
  sourceProductIds: Iterable<string>,
): string[] {
  const ids = new Set<string>();
  for (const sourceProductId of sourceProductIds) {
    for (const companionId of COMPANION_PRODUCT_IDS_BY_SOURCE[sourceProductId] ?? []) {
      ids.add(companionId);
    }
  }
  return [...ids];
}
