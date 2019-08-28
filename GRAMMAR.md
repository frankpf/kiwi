<!-- prettier-ignore-start -->

program   -> statement* EOF .
statement -> expression_stmt
           | print_stmt
           | let_decl_stmt 
           | assignment_stmt .

expression_stmt -> expression ";" .
print_stmt      -> "print" expression ";" .
let_decl_stmt   -> "let" IDENTIFIER ( "=" expr )? ";" .
let_assign_stmt -> IDENTIFIER "=" expr ";" .

expression        -> equality ;
equality          -> comparison ( ( "!=" | "==" ) comparison )* .
comparison        -> addition ( ( ">" | ">=" | "<" | "<=" ) addition )* .
addition          -> multiplication ( ( "-" | "+" ) multiplication )* .
multiplication    -> unary ( ( "/" | "*" ) unary )* .
unary             -> ( "!" | "-" ) unary
                   | primary .
primary           -> NUMBER | STRING | IDENTIFIER
                   | "false" | "true" | "nil"
                   | "(" expression ")" .
<!-- prettier-ignore-end -->
