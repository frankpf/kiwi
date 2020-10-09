<!-- prettier-ignore-start -->

program   -> statement* EOF .
statement -> expression_stmt
           | print_stmt
           | let_decl_stmt 
           | assignment_stmt
           | while_stmt
	   | function_decl
	   | debugger_stmt .

function_decl   -> function_expr ";" .
expression_stmt -> expression ";" .
print_stmt      -> "print" expression ";" .
debugger_stmt   -> "debugger" ";".
let_decl_stmt   -> "let" IDENTIFIER ( "=" expression )? ";" .
assignment_stmt -> IDENTIFIER "=" expression ";" .
while_stmt      -> "while" expression block_expr

function_expr -> "function" IDENTIFIER? "(" paramList? ") "{" statement* "}" .
paramList     -> IDENTIFIER ( "," IDENTIFIER )* .
block_expr -> "{" statement* "}" .
if_expr    -> "if" expression block_expr else_tail? .
else_tail  -> "else" (if | block_expr) .


expression        -> logic_or ;
logic_or          -> logic_and ( "||" logic_and )* .
logic_and         -> equality ( "&&" equality )* .
equality          -> comparison ( ( "!=" | "==" ) comparison )* .
comparison        -> addition ( ( ">" | ">=" | "<" | "<=" ) addition )* .
addition          -> multiplication ( ( "-" | "+" ) multiplication )* .
multiplication    -> unary ( ( "/" | "*" ) unary )* .
unary             -> ( "!" | "-" ) unary
                   | call .
call              -> primary ( "(" arguments? ") )* .
arguments         -> expression ( "," expression )* .
primary           -> NUMBER | STRING | IDENTIFIER
                   | "false" | "true" | "nil"
                   | "(" expression ")"
                   | if_expr 
		   | function_expr
                   | block_expr.
<!-- prettier-ignore-end -->
