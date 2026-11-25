// C11.1 demo: a two-bit adder built from full adders built from half adders,
// and a register that loads the sum on a rising clock edge when load is 1.
module half_adder(input logic a, b, output logic s, c);
  xor g1(s, a, b);
  and g2(c, a, b);
endmodule

module full_adder(input logic a, b, cin, output logic s, cout);
  logic s1, c1, c2;
  half_adder h1(.a(a), .b(b), .s(s1), .c(c1));
  half_adder h2(.a(s1), .b(cin), .s(s), .c(c2));
  assign cout = c1 | c2;
endmodule

module adder #(parameter N = 2) (input logic [N-1:0] a, b, output logic [N:0] sum);
  logic [N:0] c;
  assign c[0] = 1'b0;
  for (genvar i = 0; i < N; i++) begin : bit_
    full_adder fa(.a(a[i]), .b(b[i]), .cin(c[i]), .s(sum[i]), .cout(c[i+1]));
  end
  assign sum[N] = c[N];
endmodule

module load_register #(parameter N = 3) (input logic clk, load, input logic [N-1:0] d, output logic [N-1:0] q);
  always_ff @(posedge clk)
    if (load) q <= d;
endmodule

module demo(input logic clk, load, input logic [1:0] a, b, output logic [2:0] total);
  logic [2:0] sum;
  adder #(.N(2)) add(.a(a), .b(b), .sum(sum));
  load_register #(.N(3)) r(.clk(clk), .load(load), .d(sum), .q(total));
endmodule
