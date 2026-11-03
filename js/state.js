export const state = {
    employeeData: [],
    employeeDataLoaded: false,
    partsDataLoaded: false,
    borrowDataLoaded: false,
    borrowData: [],
    borrowDataError: null,
    employeePhones: {},

    // Parts Tab State
    allData: [],
    search1: '',
    search2: '',
    currentFilteredData: [],
    currentPage: 1,

    // Images Tab State
    allDataImages: [],
    tempFilteredDataImages: [],
    currentFilteredDataImages: [],
    currentPageImages: 1,
    imageDatabase: {}, // { Material: ["id1", "id2", ...] }
    imageDbLoaded: false,

    // Today Tab State
    todayData: [],
    selectedTodayRows: new Set(),
    showOnlyPending: true,
    todayNextRowId: 1,
    sortConfigToday: { column: 'IDRow', direction: 'desc' },
    currentPageToday: 1,

    // Pending Calls Tab State
    allPendingData: [],
    filteredPendingData: [],
    currentPagePending: 1,
    uniqueTeams: new Set()
};
