expression : literal
           | unary
		   | binary
		   | grouping ;

literal   : NUMBER | STRING | "true" | "false" | "nil" ;

grouping  : "(" expr ")" ;

unary     : unary_op expr ;
unary_op  : "!" | "-" ;

binary    : expr binary_op expr ;
binary_op : "==" | "!=" | ">" | ">=" | "<" | "<="
          | "+"  | "-"  | "*" | "/" ;
