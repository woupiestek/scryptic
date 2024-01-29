console.info(
  JSON.stringify(
    Object.fromEntries(
      Array.from({ length: 120 }).map((
        _,
        i,
      ) => [String.fromCharCode(i + 8), i + 8]),
    ),
    null,
    2,
  ),
);
