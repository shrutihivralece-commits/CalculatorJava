import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;

public class CalculatorServer {
    private static final int PORT = 8080;

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        
        // Serve static files
        server.createContext("/", new StaticFileHandler());
        
        // Handle calculation requests
        server.createContext("/api/calculate", new CalculationHandler());
        
        server.setExecutor(null); // creates a default executor
        server.start();
        System.out.println("Calculator Server started at http://localhost:" + PORT);
    }

    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/")) {
                path = "/index.html";
            }
            
            // Allow only specific extensions to be served
            if (!path.endsWith(".html") && !path.endsWith(".css") && !path.endsWith(".js")) {
                path = "/index.html";
            }

            File file = new File("public" + path);
            
            if (file.exists() && file.isFile()) {
                byte[] bytes = Files.readAllBytes(file.toPath());
                
                String contentType = "text/plain";
                if (path.endsWith(".html")) contentType = "text/html";
                else if (path.endsWith(".css")) contentType = "text/css";
                else if (path.endsWith(".js")) contentType = "application/javascript";
                
                exchange.getResponseHeaders().set("Content-Type", contentType);
                exchange.sendResponseHeaders(200, bytes.length);
                OutputStream os = exchange.getResponseBody();
                os.write(bytes);
                os.close();
            } else {
                String response = "404 (Not Found)\n";
                exchange.sendResponseHeaders(404, response.length());
                OutputStream os = exchange.getResponseBody();
                os.write(response.getBytes());
                os.close();
            }
        }
    }

    static class CalculationHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("POST".equals(exchange.getRequestMethod())) {
                try {
                    String query = new String(exchange.getRequestBody().readAllBytes());
                    // Extract expression, ensuring we replace urlencoded parts or spaces if needed
                    // Simple JSON parsing: {"expression": "2+2"}
                    String expression = "";
                    if (query.contains("\"expression\"")) {
                        String[] parts = query.split("\"expression\"\\s*:\\s*\"");
                        if (parts.length > 1) {
                            expression = parts[1].split("\"")[0];
                        }
                    }
                    
                    if (expression.isEmpty()) {
                        throw new IllegalArgumentException("Empty expression");
                    }
                    
                    double result = evaluateExpression(expression);
                    
                    // Format to remove trailing .0
                    String resultString = (result == (long) result) ? String.format("%d", (long) result) : String.format("%s", result);
                    
                    String jsonResponse = "{\"result\": \"" + resultString + "\"}";
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                    exchange.sendResponseHeaders(200, jsonResponse.length());
                    OutputStream os = exchange.getResponseBody();
                    os.write(jsonResponse.getBytes());
                    os.close();
                } catch (Exception e) {
                    System.err.println("Error evaluating: " + e.getMessage());
                    e.printStackTrace();
                    String errorResponse = "{\"error\": \"Error evaluating expression\"}";
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                    exchange.sendResponseHeaders(400, errorResponse.length());
                    OutputStream os = exchange.getResponseBody();
                    os.write(errorResponse.getBytes());
                    os.close();
                }
            } else if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
                exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
                exchange.sendResponseHeaders(204, -1);
            } else {
                exchange.sendResponseHeaders(405, -1);
            }
        }
        
        private double evaluateExpression(String expression) {
            return new Object() {
                int pos = -1, ch;
                
                void nextChar() {
                    ch = (++pos < expression.length()) ? expression.charAt(pos) : -1;
                }
                
                boolean eat(int charToEat) {
                    while (ch == ' ') nextChar();
                    if (ch == charToEat) {
                        nextChar();
                        return true;
                    }
                    return false;
                }
                
                double parse() {
                    nextChar();
                    double x = parseExpression();
                    if (pos < expression.length()) throw new RuntimeException("Unexpected: " + (char)ch);
                    return x;
                }
                
                double parseExpression() {
                    double x = parseTerm();
                    for (;;) {
                        if      (eat('+')) x += parseTerm(); // addition
                        else if (eat('-')) x -= parseTerm(); // subtraction
                        else return x;
                    }
                }
                
                double parseTerm() {
                    double x = parseFactor();
                    for (;;) {
                        if      (eat('*')) x *= parseFactor(); // multiplication
                        else if (eat('/')) x /= parseFactor(); // division
                        else return x;
                    }
                }
                
                double parseFactor() {
                    if (eat('+')) return parseFactor(); // unary plus
                    if (eat('-')) return -parseFactor(); // unary minus
                    
                    double x;
                    int startPos = this.pos;
                    if (eat('(')) { // parentheses
                        x = parseExpression();
                        eat(')');
                    } else if ((ch >= '0' && ch <= '9') || ch == '.') { // numbers
                        while ((ch >= '0' && ch <= '9') || ch == '.') nextChar();
                        x = Double.parseDouble(expression.substring(startPos, this.pos));
                    } else {
                        throw new RuntimeException("Unexpected: " + (char)ch);
                    }
                    
                    return x;
                }
            }.parse();
        }
    }
}
