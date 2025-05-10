console.info(
  JSON.stringify(
    Array(120).keys().map((i) => [String.fromCharCode(i + 8), i + 8]),
  ),
  null,
  2,
);

const allChars = [...Array(128).keys().map((i) => String.fromCharCode(i))].join(
  "",
);
console.info(JSON.stringify(allChars));

Array(128).keys().map((i) => {
  const string = String.fromCharCode(i);
  if (string.match(/\d/)) return "d";
  if (string.match(/\s/)) return "s";
  if (string.match(/[$A-Z_a-z]/)) return "a";
});
