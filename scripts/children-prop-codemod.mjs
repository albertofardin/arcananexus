#!/usr/bin/env node
/**
 * Codemod: enforce the `children={...}` prop form on <Text> and <Icon>.
 *
 * When one of these components has a *single* child that is just a string or a
 * single expression, it is rewritten from
 *
 *   <Text size={1}>{value}</Text>
 *
 * to the more compact, self-closing form
 *
 *   <Text size={1} children={value} />
 *
 * Elements with multiple children, or whose child contains nested JSX, are left
 * untouched (the expanded form is clearer there).
 *
 * Usage:
 *   node scripts/children-prop-codemod.mjs            # check only (CI: exits 1 if changes needed)
 *   node scripts/children-prop-codemod.mjs --fix      # apply changes, then run Prettier
 *   node scripts/children-prop-codemod.mjs --fix --no-format   # apply, skip Prettier
 *
 * Aliases: --check (default), --write (= --fix).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
// Named `nodeRequire` (not `require`) so eslint-plugin-import's static
// require()-detection doesn't mistake this call for a CommonJS import and
// misplace it in the import/order group check below.
const nodeRequire = createRequire(path.join(PROJECT_ROOT, "package.json"));
const ts = nodeRequire("typescript");

// Components whose string-only children should use the `children` prop.
const TARGETS = new Set(["Text", "Icon"]);
const SRC_DIR = path.join(PROJECT_ROOT, "src");

const args = new Set(process.argv.slice(2));
const FIX = args.has("--fix") || args.has("--write");
const FORMAT = FIX && !args.has("--no-format");

function collectTsxFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// Keep only children that carry meaning (drop whitespace-only JSX text).
function meaningfulChildren(children, sf) {
  return children.filter(c => {
    if (c.kind === ts.SyntaxKind.JsxText) {
      return c.getText(sf).trim().length > 0;
    }
    return true;
  });
}

// Returns the `children` attribute text for a qualifying child, or null if the
// element should be left as-is.
function childrenAttrFor(child, sf) {
  if (child.kind === ts.SyntaxKind.JsxText) {
    const collapsed = child.getText(sf).trim().replace(/\s+/g, " ");
    if (collapsed.includes('"')) {
      return `children={'${collapsed.replace(/'/g, "\\'")}'}`;
    }
    return `children="${collapsed}"`;
  }

  if (child.kind === ts.SyntaxKind.JsxExpression) {
    if (!child.expression) return null; // {/* comment */}
    // Leave alone when the expression itself contains JSX — it's not "just a string".
    let hasJsx = false;
    const scan = node => {
      if (
        node.kind === ts.SyntaxKind.JsxElement ||
        node.kind === ts.SyntaxKind.JsxSelfClosingElement ||
        node.kind === ts.SyntaxKind.JsxFragment
      ) {
        hasJsx = true;
      }
      if (!hasJsx) ts.forEachChild(node, scan);
    };
    scan(child.expression);
    if (hasJsx) return null;
    return `children={${child.expression.getText(sf)}}`;
  }

  return null; // a single JSX element child, etc.
}

function processFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );

  const edits = []; // { start, end, replacement, line, name }

  const visit = node => {
    if (node.kind === ts.SyntaxKind.JsxElement) {
      const name = node.openingElement.tagName.getText(sf);
      if (TARGETS.has(name)) {
        const kids = meaningfulChildren(node.children, sf);
        if (kids.length === 1) {
          const attr = childrenAttrFor(kids[0], sf);
          if (attr) {
            const opening = node.openingElement;
            // opening tag source without its trailing '>'
            const openTag = text
              .slice(opening.getStart(sf), opening.getEnd() - 1)
              .replace(/\s+$/, "");
            edits.push({
              start: node.getStart(sf),
              end: node.getEnd(),
              replacement: `${openTag} ${attr} />`,
              line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
              name,
            });
            return; // don't descend into a converted element
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!edits.length) return { changed: false, edits };

  if (FIX) {
    // Apply bottom-to-top so earlier offsets stay valid.
    const sorted = [...edits].sort((a, b) => b.start - a.start);
    let out = text;
    for (const e of sorted) {
      out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    }
    fs.writeFileSync(file, out);
  }

  return { changed: true, edits };
}

const files = collectTsxFiles(SRC_DIR).filter(
  f => !f.endsWith("Text.tsx") && !f.endsWith("Icon.tsx") // skip component definitions
);

let totalEdits = 0;
const changedFiles = [];

for (const file of files) {
  const { changed, edits } = processFile(file);
  if (!changed) continue;
  changedFiles.push(file);
  totalEdits += edits.length;
  const rel = path.relative(PROJECT_ROOT, file);
  for (const e of edits) {
    console.log(`  ${rel}:${e.line}  <${e.name}>`);
  }
}

if (totalEdits === 0) {
  console.log("✓ Nessun <Text>/<Icon> da convertire: tutto già a posto.");
  process.exit(0);
}

if (!FIX) {
  console.log(
    `\n✗ ${totalEdits} elementi in ${changedFiles.length} file da convertire. ` +
      `Esegui con --fix per applicare.`
  );
  process.exit(1);
}

console.log(`\n✓ Convertiti ${totalEdits} elementi in ${changedFiles.length} file.`);

if (FORMAT) {
  console.log("Formatto i file modificati con Prettier...");
  const res = spawnSync("bunx", ["prettier", "--write", ...changedFiles], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
  if (res.status !== 0) {
    console.log(
      "⚠ Prettier non eseguito (avvialo a mano: bun run format). Le modifiche sono comunque applicate."
    );
  }
}
