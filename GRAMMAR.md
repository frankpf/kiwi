<!-- prettier-ignore-start -->

program   -> statement* EOF .
statement -> expression_stmt
           | print_stmt
           | let_decl_stmt 
           | assignment_stmt
           | while_stmt .

expression_stmt -> expression ";" .
print_stmt      -> "print" expression ";" .
let_decl_stmt   -> "let" IDENTIFIER ( "=" expr )? ";" .
assignment_stmt -> IDENTIFIER "=" expr ";" .
while_stmt      -> "while" expression block_expr


block_expr -> "{" statement* "}" .
if_expr    -> "if" expression block_expr else_tail? .
else_tail  -> "else" (if | block_expr) .


expression        -> equality ;
equality          -> comparison ( ( "!=" | "==" ) comparison )* .
comparison        -> addition ( ( ">" | ">=" | "<" | "<=" ) addition )* .
addition          -> multiplication ( ( "-" | "+" ) multiplication )* .
multiplication    -> unary ( ( "/" | "*" ) unary )* .
unary             -> ( "!" | "-" ) unary
                   | primary .
primary           -> NUMBER | STRING | IDENTIFIER
                   | "false" | "true" | "nil"
                   | "(" expression ")"
                   | if_expr 
                   | block_expr.
<!-- prettier-ignore-end -->
