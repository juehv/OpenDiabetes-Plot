import React, { Component } from 'react';
import {hot} from 'react-hot-loader';
import * as d3 from 'd3';

class Scale extends Component {
    render() {
        return (
            <div>
                <h2>Scale Component</h2>
            </div>
         );
    }
}

export default hot ? hot(module)(Scale) : Scale;