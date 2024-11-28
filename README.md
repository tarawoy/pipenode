
# Proxy?
No proxy

# req?
Nodejs LTS https://nodejs.org/en/download/package-manager

# How to Use

1. Ensure that Node and Git are installed on your device.
   
2. Open the terminal (CMD/Powershell/Terminal) on your device.

3. Clone this repository. You can use the following command:
   ```shell
   git clone https://github.com/tarawoy/pipenode
   ```

4. Enter the `pipenode` folder:
   ```shell
   cd pipenode
   ```

5. Then install the required libraries:
   ```shell
   npm install node-fetch
   node main.js
   ```
6. Input your token on token.txt.

7. Done,  running smoothly without proxy.


## Code to Get User ID
Goto website [pipenode](https://pipecdn.app/signup?ref=eWFuZWthdG)
inspect element > console
The JavaScript code to get the user ID is:
```javascript
copy(localStorage.getItem("token"));
```
token auto copy to your token.txt. 

Thank.
