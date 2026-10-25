/**
 * The statements for dbo.Tbl_CustomerMaster, built from the columns the table
 * actually has.
 *
 * The restaurant's POS owns this table, and not every install carries every
 * column (the live one has no `CusWeb`, for instance). So before writing, the
 * shape is read from INFORMATION_SCHEMA and the INSERT/UPDATE/SELECT are built
 * from that list. An unknown column is then never named — no more
 * "Invalid column name 'CusWeb'" — and a column the table does have still
 * receives its value.
 *
 * Pure functions only: no pool, no driver. `lib/customer.ts` does the talking.
 */

export type CustomerShape = ReadonlySet<string>; // lower-case column names

export const shapeHas = (shape: CustomerShape, column: string) => shape.has(column.toLowerCase());

export type CustomerValues = {
  locCode: string;
  cusCode: string;
  name: string;
  adds: [string, string, string, string];
  phone: string;
  email: string;
};

type Field = {
  column: string;
  /** Either `@param` (bound) or a literal SQL expression. */
  expr: string;
  param?: keyof CustomerValues | "add1" | "add2" | "add3" | "add4";
  value?: (values: CustomerValues) => unknown;
};

/** New-row fields, in the order the POS itself writes them. All optional. */
const INSERT_FIELDS: Field[] = [
  { column: "LoCCode", expr: "@locCode", param: "locCode" },
  { column: "CusCode", expr: "@cusCode", param: "cusCode" },
  { column: "CusName", expr: "@name", param: "name" },
  { column: "CusAdd1", expr: "@add1", param: "add1" },
  { column: "CusAdd2", expr: "@add2", param: "add2" },
  { column: "CusAdd3", expr: "@add3", param: "add3" },
  { column: "CusAdd4", expr: "@add4", param: "add4" },
  { column: "RegTel", expr: "@phone", param: "phone" },
  { column: "CusEmail", expr: "@email", param: "email" },
  { column: "DelRefNo", expr: "''" },
  { column: "CusWeb", expr: "''" },
  { column: "Enable", expr: "1" },
  { column: "CreditCustomer", expr: "0" },
  { column: "CreditLimit", expr: "0" },
  { column: "UsedCredit", expr: "0" },
  { column: "Rmks", expr: "''" },
  { column: "LoyalCus", expr: "0" },
  { column: "CreatedBy", expr: "'WEB'" },
  { column: "CreateDateTime", expr: "GETDATE()" },
  { column: "DeleveryCustomer", expr: "1" },
  { column: "DisPre", expr: "0" },
  { column: "AllowComplimentry", expr: "0" },
  { column: "voiceprompt", expr: "''" },
  { column: "notice", expr: "''" },
  { column: "CusBehaviour", expr: "0" },
  { column: "BlackList", expr: "0" },
  { column: "BlackListRemarks", expr: "''" },
];

/** The four columns a guest may change. */
const UPDATE_FIELDS: Field[] = [
  { column: "CusName", expr: "@name", param: "name" },
  { column: "CusEmail", expr: "@email", param: "email" },
  { column: "CusAdd1", expr: "@add1", param: "add1" },
  { column: "CusAdd2", expr: "@add2", param: "add2" },
  { column: "CusAdd3", expr: "@add3", param: "add3" },
  { column: "CusAdd4", expr: "@add4", param: "add4" },
];

const valueOf = (values: CustomerValues, param: string): unknown => {
  if (param === "add1") return values.adds[0];
  if (param === "add2") return values.adds[1];
  if (param === "add3") return values.adds[2];
  if (param === "add4") return values.adds[3];
  return (values as unknown as Record<string, unknown>)[param];
};

const keep = (fields: Field[], shape: CustomerShape) => fields.filter((field) => shapeHas(shape, field.column));

/** `INSERT INTO … (cols) VALUES (exprs)` — only the columns that exist. */
export function buildCustomerInsert(table: string, shape: CustomerShape, values: CustomerValues) {
  const fields = keep(INSERT_FIELDS, shape);
  if (!fields.length) throw new Error("Tbl_CustomerMaster has no columns the web can write to");

  const params: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.param) params[field.param] = valueOf(values, field.param);
  }

  const sql = `INSERT INTO ${table} (${fields.map((f) => f.column).join(", ")})
     VALUES (${fields.map((f) => f.expr).join(", ")})`;

  return { sql, params };
}

/** `UPDATE TOP (1) … SET …` — a column the table doesn't have is simply skipped. */
export function buildCustomerUpdate(table: string, shape: CustomerShape, values: Partial<CustomerValues>) {
  const fields = keep(UPDATE_FIELDS, shape).filter((field) => {
    const key = field.param as string;
    if (key === "add1" || key === "add2" || key === "add3" || key === "add4") return values.adds !== undefined;
    return (values as Record<string, unknown>)[key] !== undefined;
  });
  if (!fields.length) return null;

  const params: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.param) {
      const key = field.param as string;
      params[field.param] = key.startsWith("add") && values.adds
        ? values.adds[Number(key.slice(3)) - 1]
        : valueOf(values as CustomerValues, field.param as string);
    }
  }

  const sql = `UPDATE TOP (1) ${table}
     SET ${fields.map((f) => `${f.column} = ${f.expr}`).join(", ")}
   WHERE ${PHONE_MATCH}`;

  return { sql, params };
}

/** The nine digits of RegTel, whatever punctuation the POS has stored in it. */
export const PHONE_MATCH =
  "RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(RegTel,' ',''),'-',''),'(',''),')',''),'+',''), 9) = @phone";

/** The SELECT list, written from the same shape. */
export function buildCustomerSelect(table: string, shape: CustomerShape) {
  const column = (name: string, fallback: string) =>
    shapeHas(shape, name) ? `LTRIM(RTRIM(${name})) AS ${name}` : `${fallback} AS ${name}`;

  const list = [
    column("LoCCode", "''"),
    column("CusCode", "''"),
    column("CusName", "''"),
    column("RegTel", "''"),
    column("CusEmail", "''"),
    column("CusAdd1", "''"),
    column("CusAdd2", "''"),
    column("CusAdd3", "''"),
    column("CusAdd4", "''"),
  ];

  return `SELECT TOP 1 ${list.join(",\n        ")}
         FROM ${table}
        WHERE ${PHONE_MATCH}
        ORDER BY ${shapeHas(shape, "Enable") ? "Enable DESC, " : ""}${
          shapeHas(shape, "CreateDateTime") ? "CreateDateTime DESC" : "(SELECT 0)"
        }`;
}

/**
 * `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS` → a lower-case set.
 * `dbo.Tbl_CustomerMaster` becomes schema `dbo`, table `Tbl_CustomerMaster`.
 */
export function shapeFromColumns(names: readonly string[]): CustomerShape {
  return new Set(names.map((name) => String(name ?? "").toLowerCase()));
}

export function splitTableName(table: string) {
  const clean = table.replace(/[[\]]/g, "").trim();
  const [schema, ...rest] = clean.split(".");
  return rest.length ? { schema, table: rest.join(".") } : { schema: "dbo", table: schema };
}
