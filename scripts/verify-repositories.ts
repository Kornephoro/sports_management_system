import {
    getProgramDetailWithStructure,
    listSessionTemplatesWithUnitsByBlock,
    listProgressTracksByUser,
} from "../src/server/repositories/index";

async function main() {
    const userId = "00000000-0000-0000-0000-000000000001";
    const programId = "20000000-0000-0000-0000-000000000001";

    const program = await getProgramDetailWithStructure(programId, userId);
    const blockId = program?.blocks?.[0]?.id;
    const sessions = blockId
        ? await listSessionTemplatesWithUnitsByBlock(blockId)
        : [];
    const tracks = await listProgressTracksByUser(userId, programId);

    console.log(
        JSON.stringify(
            {
                programFound: !!program,
                blockCount: program?.blocks?.length ?? 0,
                sessionTemplateCount: sessions.length,
                progressTrackCount: tracks.length,
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});