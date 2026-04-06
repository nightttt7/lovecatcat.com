UPDATE posts
SET body = replace(
    replace(
      replace(
      replace(body, concat(char(92), 'r', char(92), 'n'), char(10)),
      concat(char(92), char(34)),
      char(34)
      ),
      concat(char(92), char(39)),
      char(39)
    ),
    concat(char(92), char(92)),
    char(92)
  )
WHERE body IS NOT NULL
  AND (
    instr(body, concat(char(92), 'r', char(92), 'n')) > 0
    OR instr(body, concat(char(92), char(34))) > 0
    OR instr(body, concat(char(92), char(39))) > 0
    OR instr(body, concat(char(92), char(92))) > 0
  );

SELECT COUNT(*) AS remaining_literal_crlf_posts
FROM posts
WHERE body IS NOT NULL
  AND instr(body, concat(char(92), 'r', char(92), 'n')) > 0;

SELECT COUNT(*) AS remaining_escaped_double_quote_posts
FROM posts
WHERE body IS NOT NULL
  AND instr(body, concat(char(92), char(34))) > 0;

SELECT COUNT(*) AS remaining_escaped_single_quote_posts
FROM posts
WHERE body IS NOT NULL
  AND instr(body, concat(char(92), char(39))) > 0;

SELECT COUNT(*) AS remaining_double_backslash_posts
FROM posts
WHERE body IS NOT NULL
  AND instr(body, concat(char(92), char(92))) > 0;
