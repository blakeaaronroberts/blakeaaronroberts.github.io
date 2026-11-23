// A small JSON Schema validator with no dependencies.
//
// It implements only the keywords this repository's schemas use. A schema that
// uses any other keyword makes `validate` throw, so a new keyword can never be
// silently ignored (add it here, and to validate.py's tests, when needed).
// Errors are returned as a list of { path, message }, never thrown.

// Keywords that only describe the schema and have no effect on validation.
const ANNOTATIONS = new Set(["$schema", "$id", "$defs", "title", "description"]);
const KEYWORDS = new Set([
  "$ref", "type", "enum", "const", "required", "properties", "additionalProperties",
  "propertyNames", "items", "minItems", "maxItems", "uniqueItems", "minimum", "minLength",
  "pattern", "oneOf", "if", "then",
]);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value; // "number", "string", "boolean", "object"
}

function matchesType(value, type) {
  const t = typeOf(value);
  return t === type || (type === "number" && t === "integer");
}

// Structural equality for enum, const and uniqueItems (JSON values only).
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolve(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref: ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split("/")) node = node?.[part];
  if (node === undefined) throw new Error(`unresolved $ref: ${ref}`);
  return node;
}

function check(root, schema, value, path, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push({ path, message: "is not allowed here" });
    return;
  }
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key) && !ANNOTATIONS.has(key)) {
      throw new Error(`unsupported schema keyword: ${key}`);
    }
  }
  if (schema.$ref !== undefined) {
    check(root, resolve(root, schema.$ref), value, path, errors);
  }
  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push({ path, message: `must be of type ${schema.type}, not ${typeOf(value)}` });
    return; // the keywords below assume the right type
  }
  if (schema.enum !== undefined && !schema.enum.some((e) => same(e, value))) {
    errors.push({ path, message: `must be one of ${JSON.stringify(schema.enum)}` });
  }
  if (schema.const !== undefined && !same(schema.const, value)) {
    errors.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
  }
  if (schema.minimum !== undefined && typeof value === "number" && value < schema.minimum) {
    errors.push({ path, message: `must be at least ${schema.minimum}` });
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `must have at least ${schema.minLength} character(s)` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, message: `must match ${schema.pattern}` });
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: `must have at most ${schema.maxItems} item(s)` });
    }
    if (schema.uniqueItems) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) errors.push({ path, message: "items must be unique" });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => check(root, schema.items, item, `${path}/${i}`, errors));
    }
  }
  if (typeOf(value) === "object") {
    const props = schema.properties ?? {};
    for (const name of schema.required ?? []) {
      if (!(name in value)) errors.push({ path, message: `is missing required "${name}"` });
    }
    for (const [name, item] of Object.entries(value)) {
      const here = `${path}/${name}`;
      if (schema.propertyNames !== undefined) {
        const nameErrors = [];
        check(root, schema.propertyNames, name, here, nameErrors);
        for (const e of nameErrors) errors.push({ path: here, message: `name ${e.message}` });
      }
      if (name in props) {
        check(root, props[name], item, here, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path, message: `has unexpected "${name}"` });
      } else if (typeof schema.additionalProperties === "object") {
        check(root, schema.additionalProperties, item, here, errors);
      }
    }
  }
  if (schema.oneOf !== undefined) {
    const matching = schema.oneOf.filter((s) => {
      const sub = [];
      check(root, s, value, path, sub);
      return sub.length === 0;
    });
    if (matching.length !== 1) {
      errors.push({ path, message: `must match exactly one alternative (matched ${matching.length})` });
    }
  }
  if (schema.if !== undefined && schema.then !== undefined) {
    const probe = [];
    check(root, schema.if, value, path, probe);
    if (probe.length === 0) check(root, schema.then, value, path, errors);
  }
}

/** Validate `value` against `schema`. Returns [] when valid, else [{ path, message }]. */
export function validate(schema, value) {
  const errors = [];
  check(schema, schema, value, "", errors);
  return errors;
}
