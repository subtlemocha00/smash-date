# Custom React Starter Template with Vite

This repository serves as a custom starter template for React projects using Vite. It's designed to provide a minimal setup, removing the default boilerplate that comes with Vite's React template. Ideal for quickly bootstrapping new projects without the need to remove unwanted files or dependencies.

## Features

**Minimal Setup**: Only includes the essential files and configurations needed to start a React project.
**Vite Powered**: Leverages Vite for an incredibly fast development environment and build tool.
**Pre-configured React**: React and ReactDOM are pre-installed and configured.

## How to Use This Template

To create a new project based on this template, follow these steps:

### Using `degit`

[`degit`](https://github.com/Rich-Harris/degit) makes copies of git repositories. Install it globally if you haven't already:

npm install -g degit

Then, scaffold your new project with:

degit subtlemocha00/vite-react-template [project-name]  
cd [project-name]  
npm install  

Replace [project-name] with your desired project name, no []'s.

## Running Your Project

After installing the dependencies, you can start the development server by running:

npm run dev

This command starts the Vite development server. Open http://localhost:3000 to view your project in the browser.

## Building for Production

To build your project for production, use:

npm run build

Vite generates the production build in the dist folder. You can serve it with any static file server or deploy it to a hosting service.

## Customizing Your Template

Feel free to modify this template to fit your needs. You can add or remove configurations, dependencies, or even alter the project structure. This template is just a starting point to help get up and running with React and Vite more quickly.

## Contributing

Contributions to this template are welcome. If you have improvements or fixes, please open a pull request or issue.

## License

This project is open source and available under the MIT License.
