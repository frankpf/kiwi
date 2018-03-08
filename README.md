# Kiwi

Kiwi is a little programming language. It is statically typed and compiles to
native code.

# Getting started

To build Kiwi, you need the LLVM 4.0 toolchain installed.

If your OS doesn't use `apt-get`, use the instructions available at
[LLVM's documentation](https://llvm.org/docs/GettingStarted.html#getting-started-quickly-a-summary)

Add these lines to your /etc/apt/sources.list

    deb http://apt.llvm.org/trusty/ llvm-toolchain-trusty-4.0 main
    deb-src http://apt.llvm.org/trusty/ llvm-toolchain-trusty-4.0 main

Add the LLVM GPG key:

    wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key|sudo apt-key add -

Update your packages and install LLVM:

    sudo apt-get update
    sudo apt-get install -y llvm-4.0 llvm-4.0-dev


Install the npm packages:

    env GYP_DEFINES="LLVM_CONFIG=$(which llvm-config-4.0)" yarn
