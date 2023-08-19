from flask import Flask, render_template, send_from_directory, request, make_response,jsonify
import os



app = Flask(__name__, static_folder='static')
# CORS(app, resources={r"/static/*": {"origins": "*"}})





@app.route("/")
def test():
    return render_template('test.html')



@app.before_request
def set_js_mimetype():
    if request.path.startswith('/static/') and request.path.endswith('.js'):
        response = make_response(send_from_directory(app.static_folder, request.path[8:]))
        response.headers.set('Content-Type', 'application/javascript')
        return response, 200, {'Content-Type': 'application/javascript'}



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=1000, debug=True)
