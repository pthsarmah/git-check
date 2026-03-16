#!/usr/bin/env bun

import { program } from 'commander';
import { $ } from 'bun';

const createCommitStatus = (status: string) => {
	if (!status.includes("ahead") && !status.includes("behind"))
		return "clean";
	else
		return status;
}

const createStagingStatusFlag = (status: string) => {

	const fileStatuses = status.split(/\n/g);

	if (fileStatuses.length <= 0 || status === "") {
		return;
	}

	const statusFlags = new Set(fileStatuses.map((fs) => {
		return fs?.match(/^.{2}/)?.[0] ?? "";
	}).filter(Boolean));

	const hasStaged = [...statusFlags].some(s => s[0] !== " ");
	const hasUnstaged = [...statusFlags].some(s => s[1] !== " ");

	const finalStatus = [
		hasStaged && "staged",
		hasUnstaged && "unstaged"
	].filter(Boolean).join(" ");

	return finalStatus;
}

const checkGitStuff = async (directoryPaths: string[]) => {
	const commandStatusPromises = directoryPaths.map((dir) => {
		return $`cd ${dir} && git status --porcelain`.nothrow().text();
	});

	const commandRevListPromises = directoryPaths.map((dir) => {
		return $`cd ${dir} && git for-each-ref --format="%(refname:short) %(upstream:short) %(upstream:track)" refs/heads`.nothrow().text();
	});

	const commandResults = await Promise.all(commandStatusPromises);
	const commandRevListResults = await Promise.all(commandRevListPromises);

	const gitStatusMap = directoryPaths.map((path, idx) => {
		return {
			directory: path.replace(`${process.cwd()}/`, ''),
			status: createStagingStatusFlag(commandResults[idx] as string) ?? "",
			commit: createCommitStatus(commandRevListResults[idx] as string) ?? "",
		}
	});

	return gitStatusMap;
}

const printTree = (branches: string[]) => {
	branches.forEach((branch, i) => {
		const isLast = i === branches.length - 1;
		const prefix = isLast ? "└─ " : "├─ ";

		process.stdout.write(`\x1b[31m${prefix}${branch}\n\x1b[0m`);
	});
}

const renderGitStatusMap = (statusMap: { directory: string, status: string, commit: string }[]) => {
	// LEGENDS
	console.log("\nLEGEND: ");
	console.log(`\x1b[33m■\x1b[0m - unstaged changes`);
	console.log(`\x1b[32m■\x1b[0m - staged changes but not commited`);
	console.log(`\x1b[31m■\x1b[0m - not in sync with remote\n`);
	// LEGENDS

	statusMap.forEach((s) => {
		let legendMarkers = "";
		if (s.status.includes("unstaged")) legendMarkers += `\x1b[33m■\x1b[0m `;
		if (s.status.includes("staged")) legendMarkers += `\x1b[32m■\x1b[0m `;
		if (s.commit !== "clean") legendMarkers += `\x1b[31m■\x1b[0m `;
		process.stdout.write(`• ${s.directory} ${legendMarkers}\n`)
		if (s.commit !== "clean") {
			printTree(s.commit.split(/\n/).filter(f => f !== ""));
		}
	})
}

const getDirectoryPaths = async () => {
	const output = await $`ls -la`.text();
	const outputPaths = output.split(/\n/g);

	const directories = outputPaths.filter((p: string) => {
		const extension = /\.[A-Za-z0-9]+/g;
		if (!p.match(extension)) {
			//does not have extension => not a file
			if (p !== "." && p !== "..") {
				return p;
			}
		}
		return null;
	});

	const directoryPaths = directories.map((dir) => {
		const curr = process.cwd();
		return `${curr}/${dir}`;
	});

	return directoryPaths;
}

const stageAllDirectories = (paths: string[]) => {
	paths.forEach(async (dir) => {
		await $`cd ${dir} && git add .`.nothrow().quiet();
	})
}

const commitAllDirectories = (paths: string[]) => {
	paths.forEach(async (dir) => {
		await $`cd ${dir} && git commit -m "this is a git-check commit (${crypto.randomUUID()})"`.nothrow().quiet();
	})
}

const pushAllDirectories = (paths: string[]) => {
	paths.forEach(async (dir) => {
		await $`cd ${dir} && git push`.nothrow().quiet();
	})
}

program
	.name("git-check")
	.action(async () => {

		const directoryPaths = await getDirectoryPaths();
		const res = await checkGitStuff(directoryPaths);

		renderGitStatusMap(res);
	});

program
	.command("stage-all")
	.action(async () => {
		const directoryPaths = await getDirectoryPaths();
		stageAllDirectories(directoryPaths);
	});

program
	.command("commit-all")
	.action(async () => {
		const directoryPaths = await getDirectoryPaths();
		stageAllDirectories(directoryPaths);
		commitAllDirectories(directoryPaths);
	});

program
	.command("stage")
	.argument("<repos...>", "list of git repos")
	.action(async (repos, _) => {
		const argumentPaths: string[] = repos;
		const directoryPaths = await getDirectoryPaths();
		const filteredDirectoryPaths = directoryPaths.filter((dir) => argumentPaths.includes(dir.replace(`${process.cwd()}/`, '')));

		stageAllDirectories(filteredDirectoryPaths);
	});

program
	.command("commit")
	.argument("<repos...>", "list of git repos")
	.action(async (repos, _) => {
		const argumentPaths: string[] = repos;
		const directoryPaths = await getDirectoryPaths();
		const filteredDirectoryPaths = directoryPaths.filter((dir) => argumentPaths.includes(dir.replace(`${process.cwd()}/`, '')));

		stageAllDirectories(filteredDirectoryPaths);
		commitAllDirectories(filteredDirectoryPaths);
	});

program
	.command("push")
	.argument("<repos...>", "list of git repos")
	.action(async (repos, _) => {
		const argumentPaths: string[] = repos;
		const directoryPaths = await getDirectoryPaths();
		const filteredDirectoryPaths = directoryPaths.filter((dir) => argumentPaths.includes(dir.replace(`${process.cwd()}/`, '')));

		stageAllDirectories(filteredDirectoryPaths);
		commitAllDirectories(filteredDirectoryPaths);
		pushAllDirectories(filteredDirectoryPaths);
	});

program
	.command("push-all")
	.action(async () => {
		const directoryPaths = await getDirectoryPaths();
		stageAllDirectories(directoryPaths);
		commitAllDirectories(directoryPaths);
		pushAllDirectories(directoryPaths)
	});

program.parse();
