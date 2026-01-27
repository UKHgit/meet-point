#!/usr/bin/env python3
"""
Simple HTTP server for GitHub Pages
"""

import http.server
import json
import urllib.parse
from urllib.parse import urlparse, parse_qs

class ChatHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self):
        super().__init__()
        self.rooms = {}
    
    def do_GET(self):
        parsed_path = urlparse.urlparse(self.path)
        path = parsed_path.path
        
        if path == '/':
            return self.serve_file('index.html', 'text/html')
        elif path == '/style.css':
            return self.serve_file('style.css', 'text/css')
        elif path == '/script.js':
            return self.serve_file('script.js', 'application/javascript')
        elif path == '/api/chat':
            return self.handle_chat_get()
        elif path == '/api/rooms':
            return self.handle_rooms_get()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'404 Not Found')
    
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            post_data = self.rfile.read(content_length)
            data = parse_qs(post_data.decode('utf-8'))
            
            if self.path.startswith('/api/'):
                return self.handle_api_post(data)
        
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'404 Not Found')
    
    def serve_file(self, filename, content_type):
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read()
                self.send_response(200)
                self.send_header('Content-type', content_type)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'File not found')
    
    def handle_chat_get(self):
        query = urlparse.urlparse(self.path).query
        params = parse_qs(query)
        room = params.get('room', [''])[0]
        
        if room and room in self.rooms:
            return self.send_json_response({
                'success': True,
                'room': room,
                'messages': self.rooms[room]['messages']
            })
        else:
            return self.send_json_response({
                'success': True,
                'message': 'Chat API ready'
            })
    
    def handle_rooms_get(self):
        rooms = list(self.rooms.keys())
        return self.send_json_response({'success': True, 'rooms': rooms})
    
    def handle_api_post(self, data):
        message_type = data.get('type', [''])[0]
        text = data.get('text', [''])[0]
        room = data.get('room', [''])[0]
        username = data.get('username', ['Anonymous'])[0]
        
        if message_type == 'message' and text and room:
            if room not in self.rooms:
                self.rooms[room] = {
                    'name': room,
                    'messages': []
                }
            
            message = {
                'type': 'message',
                'text': text,
                'room': room,
                'username': username,
                'timestamp': self.get_timestamp(),
                'id': self.generate_id()
            }
            
            self.rooms[room]['messages'].append(message)
            
            if len(self.rooms[room]['messages']) > 50:
                self.rooms[room]['messages'] = self.rooms[room]['messages'][-50:]
            
            return self.send_json_response({'success': True, 'message': message})
        
        return self.send_json_response({'success': False, 'error': 'Invalid request'})
    
    def send_json_response(self, data):
        response = json.dumps(data)
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(response.encode('utf-8'))
    
    def generate_id(self):
        import random
        return ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
    
    def get_timestamp(self):
        from datetime import datetime
        return datetime.now().isoformat()

def run_server():
    port = 8000
    server_address = ('0.0.0.0', port)
    httpd = http.server.HTTPServer(server_address, ChatHandler)
    
    print(f"Chat server running on http://0.0.0.0:{port}")
    print("Open http://localhost:8000 in your browser")
    print("This works with GitHub Pages!")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == '__main__':
    run_server()