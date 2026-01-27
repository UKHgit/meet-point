#!/usr/bin/env python3
"""
Simple HTTP server for chat app
Supports static file serving and API endpoints
"""

import http.server
import socketserver
import threading
import json
import urllib.parse
from urllib.parse import urlparse, parse_qs

class ChatServer:
    def __init__(self, host='0.0.0.0', port=8000):
        self.host = host
        self.port = port
        self.rooms = {}
        self.clients = {}
        self.message_history = {}
        
    def start(self):
        """Start the HTTP server"""
        server_address = (self.host, self.port)
        httpd = http.server.HTTPServer(server_address, self.handle_request)
        
        print(f"Chat server running on http://{self.host}:{self.port}")
        print("Open http://localhost:8000 in your browser")
        print("This works with the JavaScript frontend")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
    
    def handle_request(self, handler):
        """Handle HTTP requests"""
        try:
            # Parse the request
            parsed_path = urlparse.urlparse(handler.path)
            path = parsed_path.path
            
            # Get client IP for identification
            client_ip = self.get_client_ip(handler)
            client_id = f"{client_ip}_{handler.server.port}"
            
            # Register client
            if client_id not in self.clients:
                self.clients[client_id] = {
                    'ip': client_ip,
                    'username': 'Anonymous',
                    'room': None
                }
            
            # Route requests
            if path == '/':
                return self.serve_file(handler, 'index.html', 'text/html')
            elif path == '/style.css':
                return self.serve_file(handler, 'style.css', 'text/css')
            elif path == '/script.js':
                return self.serve_file(handler, 'script.js', 'application/javascript')
            elif path == '/api/message':
                return self.handle_api_message(handler)
            elif path == '/api/update':
                return self.handle_api_update(handler)
            elif path.startswith('/static/'):
                # Serve static files
                filename = path[8:]  # Remove '/static/'
                return self.serve_file(handler, filename, self.get_mime_type(filename))
            else:
                # 404 for everything else
                handler.send_response(404)
                handler.send_header('Content-type', 'text/html')
                handler.end(b'<h1>404 Not Found</h1>')
    
    def handle_api_message(self, handler):
        """Handle message API endpoint"""
        try:
            content_length = int(handler.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = handler.rfile.read(content_length)
                data = parse_qs(post_data.decode('utf-8'))
                
                message_type = data.get('type', [''])[0]
                text = data.get('text', '').strip()
                room = data.get('room', '').strip()
                username = data.get('username', 'Anonymous').strip()
                reply_to = data.get('replyTo', '{}')
                
                if reply_to:
                    try:
                        reply_to_data = json.loads(reply_to)
                    except:
                        reply_to_data = {}
                else:
                    reply_to_data = {}
                
                # Get client
                client_ip = self.get_client_ip(handler)
                client_id = f"{client_ip}_{handler.server.port}"
                
                # Register or update client
                if client_id in self.clients:
                    self.clients[client_id]['room'] = room
                    self.clients[client_id]['username'] = username
                
                # Create message
                message = {
                    'type': message_type,
                    'text': text,
                    'room': room,
                    'username': username,
                    'replyTo': reply_to_data,
                    'timestamp': self.get_timestamp(),
                    'id': self.generate_id()
                }
                
                # Store message
                if room not in self.message_history:
                    self.message_history[room] = []
                self.message_history[room].append(message)
                
                # Keep only last 50 messages
                if len(self.message_history[room]) > 50:
                    self.message_history[room] = self.message_history[room][-50:]
                
                # Broadcast to all clients in room
                self.broadcast_to_room(room, message)
                
                # Send response
                response = json.dumps({'success': True, 'message': message})
                handler.send_response(200)
                handler.send_header('Content-Type', 'application/json')
                handler.end(response.encode('utf-8'))
            else:
                handler.send_response(400)
                handler.send_header('Content-Type', 'application/json')
                handler.end(json.dumps({'success': False, 'error': 'No message data'}))
                
        except Exception as e:
            handler.send_response(500)
            handler.send_header('Content-Type', 'application/json')
            handler.end(json.dumps({'success': False, 'error': str(e)}))
    
    def handle_api_update(self, handler):
        """Handle update API endpoint"""
        try:
            content_length = int(handler.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = handler.rfile.read(content_length)
                data = parse_qs(post_data.decode('utf-8'))
                
                update_type = data.get('type', [''])[0]
                
                # Get client
                client_ip = self.get_client_ip(handler)
                client_id = f"{client_ip}_{handler.server.port}"
                
                if client_id in self.clients:
                    client = self.clients[client_id]
                    
                    if update_type == 'username':
                        new_username = data.get('username', 'Anonymous').strip()
                        old_username = client['username']
                        client['username'] = new_username
                        
                        # Broadcast username update
                        if client['room']:
                            update_msg = {
                                'type': 'system',
                                'text': f"{old_username}'s nickname is now {new_username}"
                            }
                            self.broadcast_to_room(client['room'], update_msg)
                    
                    return self.send_json_response(handler, {'success': True})
                else:
                    return self.send_json_response(handler, {'success': False, 'error': 'Unknown update type'})
            else:
                return self.send_json_response(handler, {'success': False, 'error': 'No update data'})
                
        except Exception as e:
            return self.send_json_response(handler, {'success': False, 'error': str(e)})
    
    def get_client_ip(self, handler):
        """Get client IP address"""
        if hasattr(handler, 'client_address'):
            return handler.client_address[0]
        elif hasattr(handler, 'headers') and 'X-Forwarded-For' in handler.headers:
            return handler.headers['X-Forwarded-For']
        return handler.client_address[0] if handler.client_address else '127.0.0.1'
    
    def get_mime_type(self, filename):
        """Get MIME type for filename"""
        if filename.endswith('.js'):
            return 'application/javascript'
        elif filename.endswith('.css'):
            return 'text/css'
        elif filename.endswith('.html'):
            return 'text/html'
        elif filename.endswith('.json'):
            return 'application/json'
        else:
            return 'text/plain'
    
    def serve_file(self, handler, filename, content_type):
        """Serve a static file"""
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read()
            
            handler.send_response(200)
            handler.send_header('Content-Type', content_type)
            handler.send_header('Access-Control-Allow-Origin', '*')
            handler.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            handler.send_header('Access-Control-Allow-Headers', 'Content-Type')
            handler.end(content.encode('utf-8'))
        except FileNotFoundError:
            handler.send_response(404)
            handler.end(f'File {filename} not found')
        except Exception as e:
            handler.send_response(500)
            handler.end(str(e))
    
    def send_json_response(self, handler, data):
        """Send JSON response"""
        response = json.dumps(data)
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        handler.send_header('Access-Control-Allow-Headers', 'Content-Type')
        handler.end(response.encode('utf-8'))
    
    def broadcast_to_room(self, room, message):
        """Broadcast message to all clients in a room"""
        if room in self.clients:
            room_clients = [
                (client_id, client_data) for client_id, client_data in self.clients.items()
                if client_data.get('room') == room
            ]
            
            for client_id, client_data in room_clients:
                try:
                    # Try to send via client connection if exists
                    if hasattr(client_data, 'connection'):
                        # WebSocket client (not used in Python mode)
                        pass
                except:
                    # HTTP client - would need to implement server-sent events
                    pass
    
    def get_timestamp(self):
        """Get current timestamp"""
        import datetime
        return datetime.datetime.now().isoformat()
    
    def generate_id(self):
        """Generate random message ID"""
        import random
        return ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))

if __name__ == '__main__':
    import sys
    host = '0.0.0.0'
    port = 8000
    
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Port must be a number")
            sys.exit(1)
    
    server = ChatServer(host, port)
    server.start()