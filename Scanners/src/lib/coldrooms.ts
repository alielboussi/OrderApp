export type ColdroomWarehouse = {
  id: string;
  name: string;
  code: string | null;
  isParent?: boolean;
};

export const COLDROOM_PARENT_ID = "fad8f3bf-6a13-471f-9198-c46bc65014e4";

export const COLDROOM_PARENT: ColdroomWarehouse = {
  id: COLDROOM_PARENT_ID,
  name: "Coldrooms (all)",
  code: "008",
  isParent: true
};

export const COLDROOM_CHILDREN: ColdroomWarehouse[] = [
  { id: "d4ad6512-6d0b-448f-b407-e74b0eb80edb", name: "Coldroom # 1", code: "033" },
  { id: "647ca589-f688-4c9a-b137-78efedd5dbf5", name: "Coldroom # 2", code: "032" },
  { id: "32ad8045-1526-4aaa-85d9-e762b9ec8bcc", name: "Coldroom # 3", code: "031" },
  { id: "99547ec7-3220-40c8-859b-29d26ca5a4ca", name: "Coldroom # 4", code: "030" },
  { id: "9a55ecbd-aa45-4f02-9e16-f567b8779674", name: "Coldroom # 5", code: "029" },
  { id: "9885ad87-66e0-46ec-8872-ce58c524b739", name: "Coldroom # 6", code: "028" },
  { id: "6c488b69-e793-45e0-a744-441924f5f4bb", name: "Coldroom # 7", code: "027" },
  { id: "d829d739-7311-4647-af91-cad33c21280e", name: "Coldroom # 8", code: "009" },
  { id: "9d0a3a83-1fea-45a8-8771-25cc1db9f07e", name: "Coldroom # 9", code: "010" },
  { id: "89e4a592-1385-4b40-9685-2178f124a9da", name: "Coldroom # 10", code: "011" },
  { id: "94f86655-bed8-404c-8614-007a846f89f2", name: "Coldroom # 11", code: "012" }
];

export const COLDROOM_CHILD_IDS = COLDROOM_CHILDREN.map((room) => room.id);

export const COLDROOM_WAREHOUSES: ColdroomWarehouse[] = [COLDROOM_PARENT, ...COLDROOM_CHILDREN];
